"""Path security policy for the semantic search module."""
import os
import pathlib
from typing import Optional

_approved_roots: list[str] = []


def set_approved_roots(roots: list[str]) -> None:
    _approved_roots.clear()
    _approved_roots.extend(os.path.realpath(r) for r in roots)


def get_approved_roots() -> list[str]:
    return list(_approved_roots)


def _is_safe_path(path: str) -> tuple[bool, Optional[str]]:
    """Return (is_safe, reason).  Checks for traversal and symlink escapes."""
    if '\x00' in path:
        return False, 'null byte in path'
    try:
        real = os.path.realpath(path)
    except (OSError, ValueError):
        return False, 'path resolution failed'
    if not os.path.exists(real):
        return True, None  # not-yet-existing paths are checked on parent
    if _approved_roots:
        if not any(real == r or real.startswith(r + os.sep) for r in _approved_roots):
            return False, 'path is outside all approved roots'
    return True, None


def validate_index_path(path: str) -> str:
    """Raise ValueError if path is unsafe.  Return realpath on success."""
    ok, reason = _is_safe_path(path)
    if not ok:
        raise ValueError(f'Unsafe path [{reason}]: {path!r}')
    return os.path.realpath(path)


def validate_search_source(path: str) -> str:
    """Validate that a source path is safe to read from."""
    real = validate_index_path(path)
    if not os.path.exists(real):
        raise ValueError(f'Source does not exist: {real!r}')
    return real


def is_allowed_file(path: str, extra_denied_dirs: Optional[list[str]] = None) -> tuple[bool, str]:
    """Check whether a file should be indexed."""
    from .config import SUPPORTED_EXTENSIONS, DENIED_FILENAMES, DENIED_DIR_SEGMENTS, INDEX_MAX_FILE_MB

    try:
        p = pathlib.Path(path)
    except (TypeError, ValueError):
        return False, 'invalid path'

    # Filename checks
    if p.name.lower() in DENIED_FILENAMES:
        return False, f'denied filename: {p.name}'
    if p.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False, f'unsupported extension: {p.suffix}'

    # Directory segment checks
    all_denied = DENIED_DIR_SEGMENTS | set(extra_denied_dirs or [])
    for part in p.parts:
        if part.lower() in all_denied:
            return False, f'denied directory segment: {part}'

    # Size check
    try:
        size_mb = os.path.getsize(path) / 1_048_576
        if size_mb > INDEX_MAX_FILE_MB:
            return False, f'file too large: {size_mb:.1f}MB > {INDEX_MAX_FILE_MB}MB'
    except OSError:
        return False, 'cannot stat file'

    return True, ''
