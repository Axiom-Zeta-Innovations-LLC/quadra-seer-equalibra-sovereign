from __future__ import annotations

from typing import Any, Dict


def select_orchestration_strategy(
    capability: Dict[str, Any],
    *,
    cloud_escalation_allowed: bool,
) -> Dict[str, Any]:
    """Select orchestration strategy from capability metadata, not provider names."""
    inference_scope = str(capability.get("inference_scope") or "mock").strip().lower()
    backend = str(capability.get("backend") or "mock").strip().lower()

    base = {
        "context_window": int(capability.get("context_window") or 0),
        "supports_streaming": bool(capability.get("supports_streaming", False)),
        "supports_tool_calls": bool(capability.get("supports_tool_calls", False)),
        "inference_scope": inference_scope,
        "backend": backend,
    }

    if inference_scope == "local":
        return {
            **base,
            "strategy_id": "capability_local_direct",
            "execution_path": "local_direct",
            "reason_code": "STRATEGY_CAPABILITY_LOCAL",
        }

    if inference_scope == "cloud":
        if cloud_escalation_allowed:
            return {
                **base,
                "strategy_id": "capability_cloud_escalated",
                "execution_path": "cloud_escalated",
                "reason_code": "STRATEGY_CAPABILITY_CLOUD_ALLOWED",
            }
        return {
            **base,
            "strategy_id": "capability_cloud_policy_blocked",
            "execution_path": "cloud_policy_blocked",
            "reason_code": "STRATEGY_CAPABILITY_CLOUD_POLICY_BLOCKED",
        }

    return {
        **base,
        "strategy_id": "capability_mock_fallback",
        "execution_path": "mock_fallback",
        "reason_code": "STRATEGY_CAPABILITY_MOCK",
    }
