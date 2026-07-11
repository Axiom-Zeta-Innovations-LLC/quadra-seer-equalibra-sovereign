from __future__ import annotations

from typing import Any, Dict


def build_cycle_trigger_payload(
    *,
    session_id: str,
    query_class: str,
    cycle: int,
    decision: Dict[str, Any],
) -> Dict[str, Any]:
    ran = bool(decision.get("ran", False))
    reason = str(decision.get("reason") or ("allowed" if ran else "not-run"))
    trigger_type = "symbolic_cycle_ran" if ran else "symbolic_cycle_blocked"

    return {
        "session_id": session_id,
        "query_class": str(query_class or "simple"),
        "cycle": int(cycle),
        "trigger_type": trigger_type,
        "ran": ran,
        "reason": reason,
        "estimated_cost_ms": decision.get("estimated_cost_ms"),
        "elapsed_ms": decision.get("elapsed_ms"),
        "tags": decision.get("tags", []),
        "governance": decision.get("governance", {}),
    }


def build_query_lifecycle_payload(
    *,
    session_id: str,
    stage: str,
    query_class: str,
    reasoning_budget: Dict[str, Any],
    provider_selected: str,
) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "stage": str(stage),
        "query_class": str(query_class or "simple"),
        "provider_selected": str(provider_selected or "unknown"),
        "reasoning_budget": {
            "enabled": bool(reasoning_budget.get("enabled", False)),
            "max_cycles": int(reasoning_budget.get("max_cycles", 0)),
            "cycles_attempted": int(reasoning_budget.get("cycles_attempted", 0)),
            "cycles_ran": int(reasoning_budget.get("cycles_ran", 0)),
            "stopped_reason": str(reasoning_budget.get("stopped_reason", "unknown")),
        },
    }
