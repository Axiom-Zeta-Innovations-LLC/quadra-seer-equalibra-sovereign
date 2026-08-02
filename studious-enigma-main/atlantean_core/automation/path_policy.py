"""Path policy and approved-root enforcement for automation."""
import os
import json
import threading

_lock = threading.Lock()
_approved_roots: list[str] = []
_state_file = os.path.abspath('./vault_data/automation_roots.json')


def _load():
    global _approved_roots
    if os.path.exists(_state_file):
        try:
            with open(_state_file) as f:
                _approved_roots = json.load(f).get('roots', [])
        except Exception:
            _approved_roots = []


def _save():
    os.makedirs(os.path.dirname(_state_file), exist_ok=True)
    with open(_state_file, 'w') as f:
        json.dump({'roots': _approved_roots}, f)


_load()


def get_approved_roots() -> list[str]:
    with _lock:
        return list(_approved_roots)


def add_approved_root(path: str) -> str:
    real = _safe_realpath(path)
    if not os.path.isdir(real):
        raise ValueError(f'Approved root must be an existing directory: {real!r}')
    with _lock:
        if real not in _approved_roots:
            _approved_roots.append(real)
            _save()
    return real


def remove_approved_root(path: str) -> bool:
    real = os.path.realpath(path)
    with _lock:
        if real in _approved_roots:
            _approved_roots.remove(real)
            _save()
            return True
    return False


def _safe_realpath(path: str) -> str:
    if '\x00' in path:
        raise ValueError('Null byte in path')
    try:
        return os.path.realpath(path)
    except (OSError, ValueError) as e:
        raise ValueError(f'Invalid path: {e}')


def validate_path(path: str, allow_nonexistent: bool = False) -> str:
    """Ensure path is within an approved root and has no traversal. Returns realpath."""
    real = _safe_realpath(path)
    with _lock:
        roots = list(_approved_roots)
    if not roots:
        raise PermissionError('No approved filesystem roots configured. Add a root first.')
    if not any(real == r or real.startswith(r + os.sep) for r in roots):
        raise PermissionError(f'Path is outside all approved roots: {real!r}')
    if not allow_nonexistent and not os.path.exists(real):
        raise FileNotFoundError(f'Path does not exist: {real!r}')
    return real


def validate_destination(path: str) -> str:
    """Validate a write destination (may not yet exist; parent must be in approved root)."""
    real = _safe_realpath(path)
    parent = os.path.dirname(real)
    validate_path(parent, allow_nonexistent=True)
    return real
