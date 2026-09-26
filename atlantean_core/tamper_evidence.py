"""Tamper-evidence helpers for snapshots and replay consistency."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def snapshot_hash(snapshot: Dict[str, Any]) -> str:
    return sha256_hex(canonical_json(snapshot))


def verify_snapshot_hash(snapshot: Dict[str, Any], expected_hash: str) -> bool:
    if not expected_hash:
        return False
    return snapshot_hash(snapshot) == expected_hash


def verify_replay_head(replay_head_hash: str | None, expected_head_hash: str | None) -> bool:
    left = replay_head_hash or ""
    right = expected_head_hash or ""
    return left == right
