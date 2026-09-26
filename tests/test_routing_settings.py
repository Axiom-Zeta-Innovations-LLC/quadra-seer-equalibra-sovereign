"""Tests for Step 25 routing settings endpoint and model tier preference override."""

import unittest

from atlantean_core.model_tier_selector import (
    ModelTierConfig,
    ModelTierSelector,
)


class TestRoutingSettingsStep25(unittest.TestCase):

    def _make_selector(self) -> ModelTierSelector:
        return ModelTierSelector(
            config=ModelTierConfig(
                light_model="tiny",
                standard_model="medium",
                heavy_model="large",
                resource_pressure_threshold=0.8,
            )
        )

    def test_operator_preference_overrides_query_class(self):
        sel = self._make_selector()
        # deep normally → heavy, but operator pins to light
        result = sel.select("deep", operator_preference="light")
        self.assertEqual(result.selected_tier, "light")
        self.assertEqual(result.base_tier, "light")
        self.assertEqual(result.reason, "operator-preference")

    def test_operator_preference_still_downgrades_on_pressure(self):
        sel = self._make_selector()
        snap = {
            "max_total_ms_per_window": 200.0,
            "passes": {"hrm": {"window_consumed_ms": 180.0}},
        }
        # operator pins heavy; pressure (0.9) → downgrade to standard
        result = sel.select("simple", hrm_budget_snapshot=snap, operator_preference="heavy")
        self.assertTrue(result.downgraded)
        self.assertEqual(result.selected_tier, "standard")

    def test_invalid_operator_preference_falls_back_to_class(self):
        sel = self._make_selector()
        result = sel.select("analytical", operator_preference="turbo")
        self.assertEqual(result.selected_tier, "standard")
        self.assertEqual(result.reason, "query-class-default")

    def test_auto_or_none_preference_uses_class(self):
        sel = self._make_selector()
        for pref in (None, "", "auto"):
            result = sel.select("deep", operator_preference=pref)
            self.assertEqual(result.selected_tier, "heavy", f"failed for preference={pref!r}")


if __name__ == "__main__":
    unittest.main()
