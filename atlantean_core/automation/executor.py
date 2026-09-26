"""Sandboxed executor for approved automation plans."""
import os
import sys
import csv
import json
import glob
import shutil
import subprocess
import tempfile
import time
import uuid
import zipfile
import threading
from typing import Optional

from .schemas import AutomationAction, ExecutionResult, ALLOWED_ACTION_TYPES
from .path_policy import validate_path, validate_destination
from .quarantine import quarantine_file

MAX_OUTPUT_BYTES = 64 * 1024   # 64 KB output cap
TIMEOUT_SECONDS = 60
_lock = threading.Lock()
_jobs: dict[str, dict] = {}


def _truncate(s: str) -> str:
    if len(s) > MAX_OUTPUT_BYTES:
        return s[:MAX_OUTPUT_BYTES] + '\n[OUTPUT TRUNCATED]'
    return s


def execute_action(action: AutomationAction, job_id: str) -> ExecutionResult:
    started = time.time()
    result = ExecutionResult(
        job_id=job_id, plan_id='', action_type=action.type,
        status='failed', output='', error=None,
        started_at=started, finished_at=started,
    )
    try:
        handler = _HANDLERS.get(action.type)
        if handler is None:
            result.error = f'Unknown action type: {action.type}'
            return result
        handler(action, result)
        result.status = 'success'
    except PermissionError as e:
        result.error = f'Permission denied: {e}'
    except FileNotFoundError as e:
        result.error = str(e)
    except Exception as e:
        result.error = str(e)
    finally:
        result.finished_at = time.time()
    return result


def _h_list_dir(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params.get('path', '.'))
    entries = os.listdir(path)
    entries.sort()
    result.output = '\n'.join(entries)


def _h_search_files(action: AutomationAction, result: ExecutionResult):
    root = validate_path(action.params.get('path', '.'))
    pattern = action.params.get('pattern', '*')
    matches = glob.glob(os.path.join(root, '**', pattern), recursive=True)
    matches = [m for m in matches if os.path.isfile(m)][:500]
    result.output = '\n'.join(matches)


def _h_read_file(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params['path'])
    with open(path, 'r', errors='replace') as f:
        content = f.read(MAX_OUTPUT_BYTES + 1)
    result.output = _truncate(content)


def _h_create_dir(action: AutomationAction, result: ExecutionResult):
    path = validate_destination(action.params['path'])
    os.makedirs(path, exist_ok=True)
    result.output = f'Created: {path}'
    result.files_created.append(path)


def _h_copy_file(action: AutomationAction, result: ExecutionResult):
    src = validate_path(action.params['source'])
    dst = validate_destination(action.params['destination'])
    if os.path.exists(dst) and not action.params.get('overwrite', False):
        raise FileExistsError(f'Destination exists and overwrite=false: {dst}')
    shutil.copy2(src, dst)
    result.output = f'Copied: {src} → {dst}'
    result.files_created.append(dst)


def _h_move_file(action: AutomationAction, result: ExecutionResult):
    src = validate_path(action.params['source'])
    dst = validate_destination(action.params['destination'])
    shutil.move(src, dst)
    result.output = f'Moved: {src} → {dst}'
    result.files_modified.append(dst)


def _h_rename_file(action: AutomationAction, result: ExecutionResult):
    action.params['destination'] = os.path.join(
        os.path.dirname(action.params['source']),
        action.params['new_name']
    )
    _h_move_file(action, result)


def _h_write_file(action: AutomationAction, result: ExecutionResult):
    path = validate_destination(action.params['path'])
    if os.path.exists(path) and not action.params.get('overwrite', False):
        raise FileExistsError(f'File exists and overwrite=false: {path}')
    content = action.params.get('content', '')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    result.output = f'Written {len(content)} chars to {path}'
    result.files_created.append(path)


def _h_append_file(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params['path'])
    content = action.params.get('content', '')
    with open(path, 'a', encoding='utf-8') as f:
        f.write(content)
    result.output = f'Appended {len(content)} chars to {path}'
    result.files_modified.append(path)


def _h_delete_file(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params['path'])
    q = quarantine_file(path, result.job_id)
    result.output = f'Quarantined: {path} → {q}'
    result.files_quarantined.append(q)


def _h_csv_to_json(action: AutomationAction, result: ExecutionResult):
    src = validate_path(action.params['source'])
    dst = validate_destination(action.params['destination'])
    with open(src, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)
    result.output = f'Converted {len(rows)} rows: {src} → {dst}'
    result.files_created.append(dst)


def _h_json_to_csv(action: AutomationAction, result: ExecutionResult):
    src = validate_path(action.params['source'])
    dst = validate_destination(action.params['destination'])
    with open(src, encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list) or not data:
        raise ValueError('JSON must be a non-empty array of objects')
    with open(dst, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=data[0].keys())
        w.writeheader()
        w.writerows(data)
    result.output = f'Converted {len(data)} rows: {src} → {dst}'
    result.files_created.append(dst)


def _h_extract_zip(action: AutomationAction, result: ExecutionResult):
    src = validate_path(action.params['source'])
    dst = validate_destination(action.params['destination'])
    os.makedirs(dst, exist_ok=True)
    with zipfile.ZipFile(src, 'r') as z:
        # Validate member paths to prevent zip slip
        for member in z.namelist():
            dest_path = os.path.realpath(os.path.join(dst, member))
            if not dest_path.startswith(os.path.realpath(dst)):
                raise PermissionError(f'Zip slip attempt: {member}')
        z.extractall(dst)
    result.output = f'Extracted to {dst}'
    result.files_created.append(dst)


def _h_create_zip(action: AutomationAction, result: ExecutionResult):
    sources = action.params.get('sources', [])
    dst = validate_destination(action.params['destination'])
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
        for src in sources:
            real_src = validate_path(src)
            if os.path.isdir(real_src):
                for root, _, files in os.walk(real_src):
                    for f in files:
                        fp = os.path.join(root, f)
                        z.write(fp, os.path.relpath(fp, os.path.dirname(real_src)))
            else:
                z.write(real_src, os.path.basename(real_src))
    result.output = f'Archive created: {dst}'
    result.files_created.append(dst)


def _run_subprocess(cmd: list[str], cwd: Optional[str], result: ExecutionResult, env_keys: Optional[list[str]] = None):
    # Build a filtered environment — no inherited secrets
    safe_env = {}
    allowed = env_keys or ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'USER', 'LOGNAME']
    for k in allowed:
        if k in os.environ:
            safe_env[k] = os.environ[k]

    proc = subprocess.run(
        cmd, capture_output=True, text=True,
        timeout=TIMEOUT_SECONDS, cwd=cwd, env=safe_env,
        shell=False,
    )
    out = _truncate((proc.stdout or '') + (proc.stderr or ''))
    result.output = out
    if proc.returncode != 0:
        raise RuntimeError(f'Process exited {proc.returncode}')


def _h_run_python_script(action: AutomationAction, result: ExecutionResult):
    script = validate_path(action.params['path'])
    cwd = validate_path(action.params.get('cwd', os.path.dirname(script)))
    _run_subprocess([sys.executable, script], cwd, result)


def _h_run_tests(action: AutomationAction, result: ExecutionResult):
    cwd = validate_path(action.params.get('cwd', '.'))
    _run_subprocess([sys.executable, '-m', 'pytest', '--tb=short', '-q'], cwd, result)


def _h_run_build(action: AutomationAction, result: ExecutionResult):
    cwd = validate_path(action.params.get('cwd', '.'))
    cmd = action.params.get('command', 'npm run build').split()
    # Only allow known safe build commands
    ALLOWED_BUILD = {'npm', 'yarn', 'pnpm', 'make', 'python', 'cargo', 'go'}
    if cmd[0] not in ALLOWED_BUILD:
        raise PermissionError(f'Build command not in allowlist: {cmd[0]!r}')
    _run_subprocess(cmd, cwd, result)


def _h_git_status(action: AutomationAction, result: ExecutionResult):
    cwd = validate_path(action.params.get('cwd', '.'))
    _run_subprocess(['git', 'status', '--short'], cwd, result)


def _h_git_diff(action: AutomationAction, result: ExecutionResult):
    cwd = validate_path(action.params.get('cwd', '.'))
    _run_subprocess(['git', 'diff', '--stat'], cwd, result)


def _h_format_file(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params['path'])
    ext = os.path.splitext(path)[1].lower()
    if ext == '.py':
        _run_subprocess([sys.executable, '-m', 'black', '--quiet', path],
                        os.path.dirname(path), result)
    elif ext in {'.js', '.ts', '.tsx', '.jsx', '.json', '.css', '.html', '.md'}:
        _run_subprocess(['npx', '--yes', 'prettier', '--write', path],
                        os.path.dirname(path), result)
    else:
        raise ValueError(f'No formatter for extension {ext!r}')
    result.files_modified.append(path)


def _h_search_logs(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params['path'])
    pattern = action.params.get('pattern', '')
    lines = []
    with open(path, 'r', errors='replace') as f:
        for lineno, line in enumerate(f, 1):
            if pattern.lower() in line.lower():
                lines.append(f'{lineno}: {line.rstrip()}')
            if len(lines) >= 500:
                break
    result.output = '\n'.join(lines)


def _h_summarize_file(action: AutomationAction, result: ExecutionResult):
    path = validate_path(action.params['path'])
    with open(path, 'r', errors='replace') as f:
        content = f.read(20000)
    result.output = f'[File content ({len(content)} chars)]\n{content[:2000]}...'


_HANDLERS = {
    'list_dir': _h_list_dir, 'search_files': _h_search_files,
    'read_file': _h_read_file, 'create_dir': _h_create_dir,
    'copy_file': _h_copy_file, 'move_file': _h_move_file,
    'rename_file': _h_rename_file, 'write_file': _h_write_file,
    'append_file': _h_append_file, 'delete_file': _h_delete_file,
    'convert_csv_to_json': _h_csv_to_json, 'convert_json_to_csv': _h_json_to_csv,
    'extract_zip': _h_extract_zip, 'create_zip': _h_create_zip,
    'run_python_script': _h_run_python_script, 'run_tests': _h_run_tests,
    'run_build': _h_run_build, 'git_status': _h_git_status,
    'git_diff': _h_git_diff, 'format_file': _h_format_file,
    'search_logs': _h_search_logs, 'summarize_file': _h_summarize_file,
}
