from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional


def _coerce_timestamp_ms(metadata: Dict[str, Any]) -> int:
    raw_created = metadata.get("created_at_ms")
    if isinstance(raw_created, int):
        return raw_created

    raw_iso = metadata.get("timestamp")
    if isinstance(raw_iso, str) and raw_iso:
        try:
            return int(datetime.fromisoformat(raw_iso).timestamp() * 1000)
        except Exception:
            return 0

    return 0


def plan_item_retention(
    items: List[Dict[str, Any]],
    *,
    item_type: str,
    session_id: Optional[str],
    keep_max: int,
) -> List[str]:
    """Return item IDs that should be tombstoned to satisfy retention caps."""
    if keep_max < 0:
        return []

    candidates: List[Dict[str, Any]] = []
    for row in items:
        item_id = str(row.get("id") or "")
        metadata = row.get("metadata")
        if not item_id or not isinstance(metadata, dict):
            continue
        if metadata.get("tombstone"):
            continue
        if metadata.get("type") != item_type:
            continue
        if session_id and metadata.get("session_id") != session_id:
            continue

        candidates.append(
            {
                "id": item_id,
                "ts": _coerce_timestamp_ms(metadata),
            }
        )

    if len(candidates) <= keep_max:
        return []

    candidates.sort(key=lambda x: (x["ts"], x["id"]))
    prune_count = len(candidates) - keep_max
    return [row["id"] for row in candidates[:prune_count]]
