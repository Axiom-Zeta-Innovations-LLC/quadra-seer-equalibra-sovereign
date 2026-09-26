from __future__ import annotations

from typing import Dict


def classify_query_class(user_input: str, *, has_files: bool) -> str:
    text = str(user_input or "").strip().lower()
    tokens = [t for t in text.split() if t]

    if has_files:
        return "file_assisted"

    deep_markers = (
        "multi-step",
        "reasoning",
        "derive",
        "proof",
        "architecture",
        "tradeoff",
        "constraints",
        "optimiz",
    )
    analytical_markers = (
        "analy",
        "compare",
        "evaluate",
        "plan",
        "diagnos",
        "explain",
    )

    if len(tokens) >= 80 or any(marker in text for marker in deep_markers):
        return "deep"
    if len(tokens) >= 25 or any(marker in text for marker in analytical_markers):
        return "analytical"
    return "simple"


def build_query_reasoning_budget(
    query_class: str,
    *,
    enabled: bool,
    cycles_by_class: Dict[str, int],
) -> Dict[str, object]:
    normalized = str(query_class or "simple").strip().lower()
    if normalized not in {"simple", "analytical", "deep", "file_assisted"}:
        normalized = "simple"

    max_cycles = max(int(cycles_by_class.get(normalized, 0)), 0)
    return {
        "enabled": bool(enabled),
        "query_class": normalized,
        "max_cycles": max_cycles,
        "force_symbolic": bool(enabled and max_cycles > 0),
    }
