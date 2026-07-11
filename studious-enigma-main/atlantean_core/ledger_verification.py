"""Ledger verification policy helpers for restore and sync merge gates."""

from __future__ import annotations

from typing import Any, Dict


def evaluate_ledger_gate(
    ledger_report: Dict[str, Any],
    replay_proof: Dict[str, Any],
    require_replay_match: bool = True,
) -> Dict[str, Any]:
    if not bool(ledger_report.get("valid", False)):
        return {
            "allowed": False,
            "reason_code": "LEDGER_CHAIN_INVALID",
            "issues": ledger_report.get("issues", []),
        }

    if not bool(replay_proof.get("valid", False)):
        return {
            "allowed": False,
            "reason_code": "LEDGER_REPLAY_INVALID",
            "issues": replay_proof.get("issues", []),
        }

    replay_state_hash = replay_proof.get("replay_state_hash")
    replay_match = bool(replay_proof.get("match", False))

    if require_replay_match and replay_state_hash and not replay_match:
        return {
            "allowed": False,
            "reason_code": "LEDGER_REPLAY_STATE_MISMATCH",
            "issues": [{
                "replay_state_hash": replay_state_hash,
                "live_state_hash": replay_proof.get("live_state_hash"),
            }],
        }

    if replay_state_hash:
        return {
            "allowed": True,
            "reason_code": "LEDGER_VERIFIED_WITH_REPLAY",
            "issues": [],
        }

    return {
        "allowed": True,
        "reason_code": "LEDGER_VERIFIED_EMPTY_OR_NO_REPLAY_BASELINE",
        "issues": [],
    }
