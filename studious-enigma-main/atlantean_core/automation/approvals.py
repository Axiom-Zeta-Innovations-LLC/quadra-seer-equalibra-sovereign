"""HMAC-signed approval tokens with TTL."""
import hmac
import hashlib
import json
import os
import time
import threading
from typing import Optional

TOKEN_TTL_SECONDS = 300    # 5 minutes
_lock = threading.Lock()
_used_tokens: set[str] = set()   # replay prevention

_SECRET: bytes = os.urandom(32)  # session-scoped; rotates on restart


def compute_plan_hash(plan_dict: dict) -> str:
    """Deterministic hash of the plan content (excludes approval fields)."""
    stable = {k: v for k, v in plan_dict.items()
              if k not in ('approved', 'approval_token', 'approved_at', 'plan_hash')}
    canonical = json.dumps(stable, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def create_token(plan_hash: str) -> str:
    ts = str(int(time.time()))
    payload = f'{plan_hash}:{ts}'
    sig = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    return f'{payload}:{sig}'


def verify_token(token: str, plan_hash: str) -> tuple[bool, str]:
    """Returns (valid, reason). Checks signature, TTL, and replay."""
    if not token:
        return False, 'missing token'
    parts = token.split(':')
    if len(parts) != 3:
        return False, 'malformed token'
    stored_hash, ts_str, sig = parts
    if stored_hash != plan_hash:
        return False, 'plan hash mismatch (plan was modified)'
    try:
        age = time.time() - int(ts_str)
    except ValueError:
        return False, 'invalid timestamp'
    if age > TOKEN_TTL_SECONDS or age < 0:
        return False, f'token expired ({age:.0f}s old, TTL={TOKEN_TTL_SECONDS}s)'
    payload = f'{stored_hash}:{ts_str}'
    expected = hmac.new(_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False, 'invalid signature'
    with _lock:
        if token in _used_tokens:
            return False, 'token already used (replay prevented)'
        _used_tokens.add(token)
    return True, 'ok'


def consume_token(token: str) -> None:
    """Mark a token as consumed to prevent reuse."""
    with _lock:
        _used_tokens.add(token)
