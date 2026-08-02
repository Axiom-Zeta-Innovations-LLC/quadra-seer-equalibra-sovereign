"""Quarantine directory management for deleted files."""
import os
import shutil
import time
import json
import threading

_QUARANTINE_DIR = os.path.abspath('./vault_data/quarantine')
_MANIFEST = os.path.join(_QUARANTINE_DIR, 'manifest.json')
_lock = threading.Lock()


def _load_manifest() -> list[dict]:
    try:
        if os.path.exists(_MANIFEST):
            with open(_MANIFEST) as f:
                return json.load(f)
    except Exception:
        pass
    return []


def _save_manifest(entries: list[dict]) -> None:
    os.makedirs(_QUARANTINE_DIR, exist_ok=True)
    with open(_MANIFEST, 'w') as f:
        json.dump(entries, f, indent=2)


def quarantine_file(original_path: str, job_id: str) -> str:
    """Move file to quarantine. Returns quarantine path."""
    os.makedirs(_QUARANTINE_DIR, exist_ok=True)
    fname = os.path.basename(original_path)
    ts = int(time.time())
    dest = os.path.join(_QUARANTINE_DIR, f'{ts}_{fname}')
    shutil.move(original_path, dest)
    with _lock:
        entries = _load_manifest()
        entries.append({
            'quarantine_path': dest,
            'original_path': original_path,
            'quarantined_at': ts,
            'job_id': job_id,
        })
        _save_manifest(entries)
    return dest


def restore_quarantined(quarantine_path: str) -> str:
    """Restore a quarantined file to its original path."""
    with _lock:
        entries = _load_manifest()
        match = next((e for e in entries if e['quarantine_path'] == quarantine_path), None)
    if not match:
        raise ValueError(f'Not in quarantine: {quarantine_path!r}')
    original = match['original_path']
    os.makedirs(os.path.dirname(original), exist_ok=True)
    shutil.move(quarantine_path, original)
    with _lock:
        entries = [e for e in _load_manifest() if e['quarantine_path'] != quarantine_path]
        _save_manifest(entries)
    return original


def purge_quarantined(quarantine_path: str) -> None:
    """Permanently delete a quarantined file."""
    if os.path.exists(quarantine_path):
        if os.path.isfile(quarantine_path):
            os.remove(quarantine_path)
        else:
            shutil.rmtree(quarantine_path)
    with _lock:
        entries = [e for e in _load_manifest() if e['quarantine_path'] != quarantine_path]
        _save_manifest(entries)


def list_quarantine() -> list[dict]:
    with _lock:
        return _load_manifest()
