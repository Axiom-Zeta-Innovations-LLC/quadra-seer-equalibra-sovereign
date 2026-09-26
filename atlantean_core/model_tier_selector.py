"""Dynamic model tier selector by query complexity and resource pressure (Step 24).

Determines which local model tier to use for a given query based on:
- Query class (simple / analytical / deep / file_assisted)
- Current HRM/RCM compute window pressure (ratio of consumed to maximum ms)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


# ---------------------------------------------------------------------------
# Tier configuration
# ---------------------------------------------------------------------------

# Tier names ordered from lightest to heaviest.
_TIER_ORDER = ("light", "standard", "heavy")


@dataclass
class ModelTierConfig:
    """Maps tier names to model IDs and defines selection thresholds."""

    # Model ID used for each tier.
    light_model: str = ""
    standard_model: str = ""
    heavy_model: str = ""

    # Query class → preferred base tier before pressure adjustment.
    class_tier_map: Dict[str, str] = field(
        default_factory=lambda: {
            "simple": "light",
            "analytical": "standard",
            "deep": "heavy",
            "file_assisted": "heavy",
        }
    )

    # Fraction of the per-window budget (0–1) above which the tier is
    # downgraded by one step to shed compute pressure.
    resource_pressure_threshold: float = 0.8


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

@dataclass
class TierSelectionResult:
    selected_tier: str
    selected_model: str
    base_tier: str
    pressure_ratio: float
    downgraded: bool
    reason: str


# ---------------------------------------------------------------------------
# Selector
# ---------------------------------------------------------------------------

class ModelTierSelector:
    """Picks the local model tier based on query class and compute pressure."""

    def __init__(self, config: ModelTierConfig):
        self.config = config

    def _model_for_tier(self, tier: str) -> str:
        t = str(tier or "standard").lower()
        if t == "light":
            return self.config.light_model or self.config.standard_model
        if t == "heavy":
            return self.config.heavy_model or self.config.standard_model
        return self.config.standard_model

    def _downgrade_tier(self, tier: str) -> str:
        idx = _TIER_ORDER.index(tier) if tier in _TIER_ORDER else 1
        return _TIER_ORDER[max(0, idx - 1)]

    def select(
        self,
        query_class: str,
        *,
        hrm_budget_snapshot: Dict[str, Any] | None = None,
        operator_preference: str | None = None,
    ) -> TierSelectionResult:
        """Select the appropriate tier for the given query and resource state.

        Args:
            query_class: One of simple / analytical / deep / file_assisted.
            hrm_budget_snapshot: Snapshot dict from ``HRMComputeAllocator.snapshot()``.
                If provided its window consumption is used as resource pressure signal.
            operator_preference: Explicit tier name ('light'|'standard'|'heavy') from
                the operator profile settings.  When provided and valid, skips the
                query-class mapping and only applies pressure downgrade.
        """
        qc = str(query_class or "simple").lower()

        _valid_tiers = set(_TIER_ORDER)
        if operator_preference and operator_preference in _valid_tiers:
            base_tier = operator_preference
            reason = "operator-preference"
        else:
            base_tier = self.config.class_tier_map.get(qc, "standard")
            reason = "query-class-default"

        # Compute pressure ratio from HRM window stats.
        pressure_ratio = 0.0
        if hrm_budget_snapshot and self.config.resource_pressure_threshold > 0:
            max_ms_window = float(
                hrm_budget_snapshot.get("max_total_ms_per_window", 0) or 0
            )
            if max_ms_window > 0:
                hrm_window = 0.0
                passes = hrm_budget_snapshot.get("passes", {})
                for pass_info in passes.values():
                    hrm_window += float(
                        (pass_info or {}).get("window_consumed_ms", 0) or 0
                    )
                pressure_ratio = hrm_window / max_ms_window

        downgraded = False
        selected_tier = base_tier
        if reason != "operator-preference":
            reason = "query-class-default"

        if pressure_ratio >= self.config.resource_pressure_threshold:
            downgraded_tier = self._downgrade_tier(base_tier)
            if downgraded_tier != base_tier:
                selected_tier = downgraded_tier
                downgraded = True
                reason = "resource-pressure-downgrade"
            else:
                reason = "resource-pressure-at-floor"

        selected_model = self._model_for_tier(selected_tier)

        return TierSelectionResult(
            selected_tier=selected_tier,
            selected_model=selected_model,
            base_tier=base_tier,
            pressure_ratio=round(pressure_ratio, 4),
            downgraded=downgraded,
            reason=reason,
        )

    def snapshot(self, result: TierSelectionResult) -> Dict[str, Any]:
        """Serialise a tier selection result for telemetry / response metadata."""
        return {
            "selected_tier": result.selected_tier,
            "selected_model": result.selected_model,
            "base_tier": result.base_tier,
            "pressure_ratio": result.pressure_ratio,
            "downgraded": result.downgraded,
            "reason": result.reason,
        }


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def build_model_tier_config(
    *,
    light_model: str,
    standard_model: str,
    heavy_model: str,
    resource_pressure_threshold: float = 0.8,
) -> ModelTierConfig:
    """Factory used by the backend to build config from env-derived values."""
    return ModelTierConfig(
        light_model=str(light_model or ""),
        standard_model=str(standard_model or ""),
        heavy_model=str(heavy_model or ""),
        resource_pressure_threshold=float(resource_pressure_threshold),
    )
