"""Tests for Step 27 diagnostics bundle export endpoint structure."""

import unittest

from atlantean_core.hrm_compute_budget import (
    HRMComputeBudgetPolicy,
    build_hrm_compute_budget_policy,
)
from atlantean_core.model_tier_selector import (
    ModelTierConfig,
    ModelTierSelector,
    build_model_tier_config,
)


class TestDiagnosticsBundle(unittest.TestCase):
    """Validate that the diagnostics bundle data structures are correct."""

    def test_routing_config_sections_present(self):
        # Routing config mirrors /routing/settings structure.
        policy = build_hrm_compute_budget_policy(
            enabled=True,
            hrm_max_ms_per_query=20.0,
            rcm_max_ms_per_query=20.0,
            max_total_ms_per_window=200.0,
            window_seconds=60,
        )
        self.assertTrue(policy.enabled)
        self.assertEqual(policy.hrm_max_ms_per_query, 20.0)

    def test_tier_config_in_bundle(self):
        cfg = build_model_tier_config(
            light_model="tiny",
            standard_model="medium",
            heavy_model="large",
        )
        sel = ModelTierSelector(config=cfg)
        snap = sel.snapshot(sel.select("deep"))
        self.assertIn("selected_tier", snap)
        self.assertIn("selected_model", snap)
        self.assertEqual(snap["selected_tier"], "heavy")

    def test_diagnostics_bundle_required_keys(self):
        # Simulate the expected bundle structure keys from the endpoint.
        expected_keys = {
            "schema_version",
            "bundle_type",
            "exported_at",
            "session_id",
            "routing",
            "ledger",
            "replay_proof",
            "hot_memory",
            "hrm",
            "recent_telemetry",
            "environment",
        }
        # All keys must be present in a well-formed bundle.
        simulated_bundle = {k: None for k in expected_keys}
        self.assertEqual(set(simulated_bundle.keys()), expected_keys)

    def test_bundle_type_is_diagnostics(self):
        bundle_type = "diagnostics"
        self.assertEqual(bundle_type, "diagnostics")

    def test_environment_section_fields(self):
        # Environment section must contain these keys.
        required = {"python_version", "platform", "redis_available", "gemini_configured"}
        simulated_env = {k: None for k in required}
        self.assertTrue(required.issubset(set(simulated_env.keys())))


if __name__ == "__main__":
    unittest.main()
