"""Tests for hardware scaling matrix (Step 29)."""

import unittest

from atlantean_core.hardware_scaling_matrix import (
    VALID_TIER_IDS,
    get_scaling_matrix,
    get_tier,
    get_tier_or_default,
    list_tiers,
    tier_to_dict,
)


class TestHardwareScalingMatrix(unittest.TestCase):

    def test_all_three_tiers_present(self):
        tiers = list_tiers()
        self.assertIn("small_quantized", tiers)
        self.assertIn("medium", tiers)
        self.assertIn("multi_agent", tiers)

    def test_valid_tier_ids_matches_registry(self):
        self.assertEqual(set(VALID_TIER_IDS), set(list_tiers().keys()))

    def test_get_tier_returns_spec(self):
        spec = get_tier("small_quantized")
        self.assertIsNotNone(spec)
        self.assertEqual(spec.tier_id, "small_quantized")

    def test_get_tier_unknown_returns_none(self):
        self.assertIsNone(get_tier("ultra"))

    def test_get_tier_or_default_falls_back(self):
        spec = get_tier_or_default("unknown_tier")
        self.assertEqual(spec.tier_id, "medium")

    def test_small_tier_has_no_symbolic_reasoning(self):
        spec = get_tier("small_quantized")
        self.assertFalse(spec.enable_symbolic_reasoning)

    def test_medium_tier_has_symbolic_reasoning(self):
        spec = get_tier("medium")
        self.assertTrue(spec.enable_symbolic_reasoning)

    def test_multi_agent_tier_has_most_cycles(self):
        small = get_tier("small_quantized")
        medium = get_tier("medium")
        multi = get_tier("multi_agent")
        self.assertGreaterEqual(multi.reasoning_cycles_deep, medium.reasoning_cycles_deep)
        self.assertGreaterEqual(medium.reasoning_cycles_deep, small.reasoning_cycles_deep)

    def test_multi_agent_has_larger_context_window(self):
        small = get_tier("small_quantized")
        multi = get_tier("multi_agent")
        self.assertGreater(multi.context_window, small.context_window)

    def test_multi_agent_allows_more_concurrent_sessions(self):
        small = get_tier("small_quantized")
        multi = get_tier("multi_agent")
        self.assertGreater(multi.max_concurrent_sessions, small.max_concurrent_sessions)

    def test_tier_to_dict_structure(self):
        spec = get_tier("medium")
        d = tier_to_dict(spec)
        self.assertIn("tier_id", d)
        self.assertIn("models", d)
        self.assertIn("hrm_compute_budget", d)
        self.assertIn("reasoning_budgets", d)
        self.assertIn("requirements", d)
        self.assertEqual(d["tier_id"], "medium")
        self.assertIn("light", d["models"])
        self.assertIn("standard", d["models"])
        self.assertIn("heavy", d["models"])

    def test_get_scaling_matrix_structure(self):
        matrix = get_scaling_matrix()
        self.assertEqual(matrix["schema_version"], 1)
        self.assertIn("tiers", matrix)
        self.assertIn("valid_tier_ids", matrix)
        self.assertEqual(matrix["default_tier"], "medium")
        self.assertIn("small_quantized", matrix["tiers"])

    def test_hrm_budget_increases_with_tier(self):
        small = get_tier("small_quantized")
        medium = get_tier("medium")
        multi = get_tier("multi_agent")
        self.assertLessEqual(small.hrm_max_ms_per_query, medium.hrm_max_ms_per_query)
        self.assertLessEqual(medium.hrm_max_ms_per_query, multi.hrm_max_ms_per_query)

    def test_pressure_threshold_increases_with_tier(self):
        """Higher-resourced tiers tolerate more pressure before downgrading."""
        small = get_tier("small_quantized")
        multi = get_tier("multi_agent")
        self.assertLess(small.tier_pressure_threshold, multi.tier_pressure_threshold)

    def test_tier_to_dict_hrm_budget_fields(self):
        d = tier_to_dict(get_tier("medium"))
        budget = d["hrm_compute_budget"]
        self.assertIn("hrm_max_ms_per_query", budget)
        self.assertIn("max_total_ms_per_window", budget)
        self.assertIn("window_seconds", budget)


if __name__ == "__main__":
    unittest.main()
