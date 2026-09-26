"""Tests for dynamic model tier selector (Step 24)."""

import unittest

from atlantean_core.model_tier_selector import (
    ModelTierConfig,
    ModelTierSelector,
    TierSelectionResult,
    build_model_tier_config,
)


def _make_selector(**kwargs) -> ModelTierSelector:
    config = ModelTierConfig(
        light_model="llama3.2:3b-q4",
        standard_model="llama3.1:8b-q4",
        heavy_model="llama3.1:70b-q4",
        resource_pressure_threshold=0.8,
    )
    for k, v in kwargs.items():
        setattr(config, k, v)
    return ModelTierSelector(config=config)


def _budget_snap(window_consumed_ms: float, max_total_ms_per_window: float = 200.0) -> dict:
    return {
        "max_total_ms_per_window": max_total_ms_per_window,
        "passes": {
            "hrm": {"window_consumed_ms": window_consumed_ms},
        },
    }


class TestModelTierSelector(unittest.TestCase):

    def test_simple_query_selects_light_tier(self):
        sel = _make_selector()
        result = sel.select("simple")
        self.assertEqual(result.selected_tier, "light")
        self.assertEqual(result.selected_model, "llama3.2:3b-q4")
        self.assertFalse(result.downgraded)

    def test_analytical_query_selects_standard_tier(self):
        sel = _make_selector()
        result = sel.select("analytical")
        self.assertEqual(result.selected_tier, "standard")
        self.assertEqual(result.selected_model, "llama3.1:8b-q4")

    def test_deep_query_selects_heavy_tier(self):
        sel = _make_selector()
        result = sel.select("deep")
        self.assertEqual(result.selected_tier, "heavy")
        self.assertEqual(result.selected_model, "llama3.1:70b-q4")

    def test_file_assisted_selects_heavy_tier(self):
        sel = _make_selector()
        result = sel.select("file_assisted")
        self.assertEqual(result.selected_tier, "heavy")

    def test_pressure_causes_downgrade_for_deep_query(self):
        sel = _make_selector()
        snap = _budget_snap(window_consumed_ms=170.0, max_total_ms_per_window=200.0)
        # 170/200 = 0.85 >= threshold 0.8 → downgrade heavy → standard
        result = sel.select("deep", hrm_budget_snapshot=snap)
        self.assertTrue(result.downgraded)
        self.assertEqual(result.base_tier, "heavy")
        self.assertEqual(result.selected_tier, "standard")
        self.assertEqual(result.reason, "resource-pressure-downgrade")

    def test_no_downgrade_below_threshold(self):
        sel = _make_selector()
        snap = _budget_snap(window_consumed_ms=100.0, max_total_ms_per_window=200.0)
        # 100/200 = 0.5 < 0.8 → no downgrade
        result = sel.select("deep", hrm_budget_snapshot=snap)
        self.assertFalse(result.downgraded)
        self.assertEqual(result.selected_tier, "heavy")

    def test_light_tier_at_pressure_floor_stays_light(self):
        sel = _make_selector()
        snap = _budget_snap(window_consumed_ms=190.0, max_total_ms_per_window=200.0)
        # simple→light; downgrade would go below floor, stays light
        result = sel.select("simple", hrm_budget_snapshot=snap)
        self.assertEqual(result.selected_tier, "light")
        self.assertFalse(result.downgraded)
        self.assertIn(result.reason, ("resource-pressure-at-floor", "query-class-default"))

    def test_snapshot_serialisation(self):
        sel = _make_selector()
        result = sel.select("analytical")
        snap = sel.snapshot(result)
        self.assertIn("selected_tier", snap)
        self.assertIn("selected_model", snap)
        self.assertIn("pressure_ratio", snap)
        self.assertIn("downgraded", snap)

    def test_build_model_tier_config_factory(self):
        cfg = build_model_tier_config(
            light_model="tiny",
            standard_model="medium",
            heavy_model="large",
            resource_pressure_threshold=0.75,
        )
        self.assertEqual(cfg.light_model, "tiny")
        self.assertEqual(cfg.resource_pressure_threshold, 0.75)

    def test_fallback_when_no_budget_snapshot(self):
        sel = _make_selector()
        result = sel.select("deep", hrm_budget_snapshot=None)
        # Without pressure data, should use base tier for deep.
        self.assertEqual(result.selected_tier, "heavy")
        self.assertFalse(result.downgraded)


if __name__ == "__main__":
    unittest.main()
