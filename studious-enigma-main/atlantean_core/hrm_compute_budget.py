"""Compute budget allocator for HRM/RCM symbolic passes (Step 23).

Tracks compute expenditure for HRM and RCM symbolic processing passes on a
per-query and sliding-window basis.  The allocator is created fresh each
request so per-query caps are isolated while the optional window accumulator
can be shared at a higher scope.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List


# ---------------------------------------------------------------------------
# Policy configuration
# ---------------------------------------------------------------------------

@dataclass
class HRMComputeBudgetPolicy:
    """Budget caps for HRM/RCM symbolic passes."""

    enabled: bool = True

    # Per-query caps by pass type (ms).
    hrm_max_ms_per_query: float = 20.0
    rcm_max_ms_per_query: float = 20.0

    # Per-window caps (ms) shared across pass types within a rolling window.
    window_seconds: int = 60
    max_total_ms_per_window: float = 200.0

    # Per-query-class multipliers (relative to base cap).
    # Keys: "simple" | "analytical" | "deep" | "file_assisted"
    class_multipliers: Dict[str, float] = field(
        default_factory=lambda: {
            "simple": 0.5,
            "analytical": 1.0,
            "deep": 2.0,
            "file_assisted": 1.5,
        }
    )


# ---------------------------------------------------------------------------
# Window accumulator (shared across requests within a process lifetime)
# ---------------------------------------------------------------------------

class _WindowAccumulator:
    """Simple sliding-window compute tracker."""

    def __init__(self, window_seconds: int = 60):
        self.window_seconds = int(window_seconds)
        self._entries: List[tuple[float, float]] = []  # (timestamp, elapsed_ms)

    def record(self, elapsed_ms: float) -> None:
        now = time.monotonic()
        self._entries.append((now, float(elapsed_ms)))
        self._prune(now)

    def consumed_ms(self) -> float:
        self._prune(time.monotonic())
        return sum(ms for _, ms in self._entries)

    def _prune(self, now: float) -> None:
        cutoff = now - self.window_seconds
        self._entries = [(ts, ms) for ts, ms in self._entries if ts >= cutoff]


# Module-level window accumulators, keyed by pass type so HRM and RCM budgets
# are tracked independently.
_WINDOW_ACCUMULATORS: Dict[str, _WindowAccumulator] = {}


def _get_window_accumulator(pass_type: str, window_seconds: int) -> _WindowAccumulator:
    key = str(pass_type or "hrm")
    if key not in _WINDOW_ACCUMULATORS:
        _WINDOW_ACCUMULATORS[key] = _WindowAccumulator(window_seconds)
    return _WINDOW_ACCUMULATORS[key]


# ---------------------------------------------------------------------------
# Per-request allocator
# ---------------------------------------------------------------------------

@dataclass
class AllocationDecision:
    allowed: bool
    pass_type: str
    query_class: str
    reason: str
    effective_cap_ms: float
    window_consumed_ms: float
    query_consumed_ms: float


class HRMComputeAllocator:
    """Allocates and tracks HRM/RCM compute budget for a single query request."""

    def __init__(self, policy: HRMComputeBudgetPolicy | None = None):
        self.policy = policy or HRMComputeBudgetPolicy()
        self._query_consumed: Dict[str, float] = {}  # pass_type -> ms consumed this request

    def _base_cap(self, pass_type: str) -> float:
        pt = str(pass_type or "hrm").lower()
        if pt == "rcm":
            return self.policy.rcm_max_ms_per_query
        return self.policy.hrm_max_ms_per_query

    def _effective_cap(self, pass_type: str, query_class: str) -> float:
        base = self._base_cap(pass_type)
        multiplier = self.policy.class_multipliers.get(
            str(query_class or "simple").lower(), 1.0
        )
        return round(base * float(multiplier), 3)

    def allocate(self, pass_type: str, query_class: str) -> AllocationDecision:
        """Request a compute allocation for a HRM/RCM symbolic pass.

        Returns an `AllocationDecision` describing whether the pass is permitted
        and the budget context that led to the decision.
        """
        pt = str(pass_type or "hrm").lower()
        qc = str(query_class or "simple").lower()

        if not self.policy.enabled:
            return AllocationDecision(
                allowed=True,
                pass_type=pt,
                query_class=qc,
                reason="budget-disabled",
                effective_cap_ms=0.0,
                window_consumed_ms=0.0,
                query_consumed_ms=0.0,
            )

        effective_cap = self._effective_cap(pt, qc)
        query_consumed = self._query_consumed.get(pt, 0.0)

        accumulator = _get_window_accumulator(pt, self.policy.window_seconds)
        window_consumed = accumulator.consumed_ms()

        # Check per-query cap.
        if query_consumed >= effective_cap:
            return AllocationDecision(
                allowed=False,
                pass_type=pt,
                query_class=qc,
                reason="query-compute-cap-exceeded",
                effective_cap_ms=effective_cap,
                window_consumed_ms=window_consumed,
                query_consumed_ms=query_consumed,
            )

        # Check window cap.
        if window_consumed >= self.policy.max_total_ms_per_window:
            return AllocationDecision(
                allowed=False,
                pass_type=pt,
                query_class=qc,
                reason="window-compute-budget-exceeded",
                effective_cap_ms=effective_cap,
                window_consumed_ms=window_consumed,
                query_consumed_ms=query_consumed,
            )

        return AllocationDecision(
            allowed=True,
            pass_type=pt,
            query_class=qc,
            reason="allowed",
            effective_cap_ms=effective_cap,
            window_consumed_ms=window_consumed,
            query_consumed_ms=query_consumed,
        )

    def record_elapsed(self, pass_type: str, elapsed_ms: float) -> None:
        """Record actual elapsed compute for a completed pass."""
        pt = str(pass_type or "hrm").lower()
        ms = float(elapsed_ms)
        self._query_consumed[pt] = self._query_consumed.get(pt, 0.0) + ms
        _get_window_accumulator(pt, self.policy.window_seconds).record(ms)

    def snapshot(self) -> Dict[str, object]:
        """Return a serialisable budget snapshot for telemetry/response metadata."""
        result: Dict[str, object] = {
            "enabled": self.policy.enabled,
            "window_seconds": self.policy.window_seconds,
            "max_total_ms_per_window": self.policy.max_total_ms_per_window,
            "passes": {},
        }
        for pt in ("hrm", "rcm"):
            acc = _WINDOW_ACCUMULATORS.get(pt)
            window_consumed = acc.consumed_ms() if acc else 0.0
            result["passes"][pt] = {  # type: ignore[index]
                "query_consumed_ms": round(self._query_consumed.get(pt, 0.0), 3),
                "window_consumed_ms": round(window_consumed, 3),
                "hrm_cap_ms": round(self._effective_cap(pt, "simple"), 3),
            }
        return result


def build_hrm_compute_budget_policy(
    *,
    enabled: bool,
    hrm_max_ms_per_query: float,
    rcm_max_ms_per_query: float,
    max_total_ms_per_window: float,
    window_seconds: int,
) -> HRMComputeBudgetPolicy:
    """Factory used by the backend to build a policy from env-derived config."""
    return HRMComputeBudgetPolicy(
        enabled=bool(enabled),
        hrm_max_ms_per_query=float(hrm_max_ms_per_query),
        rcm_max_ms_per_query=float(rcm_max_ms_per_query),
        max_total_ms_per_window=float(max_total_ms_per_window),
        window_seconds=int(window_seconds),
    )
