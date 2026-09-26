from __future__ import annotations

from typing import Any, Dict, List

from atlantean_core.tamper_evidence import verify_snapshot_hash


def evaluate_snapshot_record(
    record: Dict[str, Any],
    payload: Dict[str, Any] | None,
    *,
    verify_hash: bool = True,
) -> Dict[str, Any]:
    """Classify whether a snapshot record is recoverable for restore operations."""
    snapshot_id = str(record.get("id") or "")
    if not snapshot_id:
        return {
            "snapshot_id": snapshot_id,
            "recoverable": False,
            "reason_code": "SNAPSHOT_ID_MISSING",
        }

    if not isinstance(payload, dict):
        return {
            "snapshot_id": snapshot_id,
            "recoverable": False,
            "reason_code": "SNAPSHOT_PAYLOAD_MISSING",
        }

    if verify_hash:
        expected_hash = str(record.get("snapshot_sha256") or "")
        if not expected_hash:
            return {
                "snapshot_id": snapshot_id,
                "recoverable": False,
                "reason_code": "SNAPSHOT_HASH_MISSING",
            }
        if not verify_snapshot_hash(payload, expected_hash):
            return {
                "snapshot_id": snapshot_id,
                "recoverable": False,
                "reason_code": "SNAPSHOT_HASH_MISMATCH",
            }

    return {
        "snapshot_id": snapshot_id,
        "recoverable": True,
        "reason_code": "SNAPSHOT_RECOVERABLE",
    }


def plan_snapshot_recovery(
    records: List[Dict[str, Any]],
    payload_by_snapshot_id: Dict[str, Dict[str, Any] | None],
    *,
    verify_hash: bool = True,
) -> Dict[str, Any]:
    """Build a deterministic recovery plan for snapshot records."""
    recoverable_ids: List[str] = []
    prune_ids: List[str] = []
    analysis: List[Dict[str, Any]] = []

    for record in records:
        snapshot_id = str(record.get("id") or "")
        result = evaluate_snapshot_record(
            record,
            payload_by_snapshot_id.get(snapshot_id),
            verify_hash=verify_hash,
        )
        analysis.append(result)
        if result.get("recoverable"):
            recoverable_ids.append(snapshot_id)
        else:
            prune_ids.append(snapshot_id)

    return {
        "recoverable_snapshot_ids": recoverable_ids,
        "prune_snapshot_ids": prune_ids,
        "analysis": analysis,
    }


def plan_ledger_recovery(
    events: List[Dict[str, Any]],
    stored_head_hash: str,
    stored_seq: int,
) -> Dict[str, Any]:
    """Build repair values for partial ledger metadata corruption."""
    expected_head_hash = ""
    expected_seq = 0

    if events:
        last = events[-1]
        expected_head_hash = str(last.get("event_hash") or "")
        last_seq = last.get("seq")
        expected_seq = int(last_seq) if isinstance(last_seq, int) else len(events)

    return {
        "expected_head_hash": expected_head_hash,
        "expected_seq": expected_seq,
        "head_repair_needed": stored_head_hash != expected_head_hash,
        "seq_repair_needed": int(stored_seq) != expected_seq,
    }
