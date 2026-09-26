"""Tests for HRM/RCM compute budget allocator (Step 23)."""

import unittest

from atlantean_core.hrm_compute_budget import (
    HRMComputeAllocator,
    HRMComputeBudgetPolicy,
    build_hrm_compute_budget_policy,
)


class TestHRMComputeBudget(unittest.TestCase):

    def _make_allocator(self, **overrides) -> HRMComputeAllocator:
        policy = HRMComputeBudgetPolicy(
            enabled=True,
            hrm_max_ms_per_query=10.0,
            rcm_max_ms_per_query=10.0,
            max_total_ms_per_window=200.0,
            window_seconds=60,
        )
        for k, v in overrides.items():
            setattr(policy, k, v)
        return HRMComputeAllocator(policy=policy)

    def test_allocation_allowed_under_cap(self):
        allocator = self._make_allocator()
        decision = allocator.allocate("hrm", "simple")
        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason, "allowed")
        self.assertEqual(decision.pass_type, "hrm")
        self.assertEqual(decision.query_class, "simple")

    def test_allocation_denied_after_query_cap_exceeded(self):
        allocator = self._make_allocator(hrm_max_ms_per_query=5.0)
        # Consume 5ms for simple class (cap=5.0 * 0.5 multiplier = 2.5ms)
        allocator.record_elapsed("hrm", 3.0)
        decision = allocator.allocate("hrm", "simple")
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "query-compute-cap-exceeded")

    def test_allocation_denied_when_budget_disabled(self):
        allocator = self._make_allocator(enabled=False)
        decision = allocator.allocate("hrm", "deep")
        # When disabled, all passes are allowed (budget-disabled reason).
        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason, "budget-disabled")

    def test_deep_query_class_gets_higher_cap(self):
        allocator = self._make_allocator(hrm_max_ms_per_query=10.0)
        decision_simple = allocator.allocate("hrm", "simple")
        decision_deep = allocator.allocate("hrm", "deep")
        # deep cap = 10.0 * 2.0 = 20.0; simple cap = 10.0 * 0.5 = 5.0
        self.assertGreater(decision_deep.effective_cap_ms, decision_simple.effective_cap_ms)

    def test_rcm_pass_type_tracked_independently(self):
        allocator = self._make_allocator(hrm_max_ms_per_query=2.0, rcm_max_ms_per_query=2.0)
        allocator.record_elapsed("hrm", 5.0)
        hrm_decision = allocator.allocate("hrm", "simple")
        rcm_decision = allocator.allocate("rcm", "simple")
        self.assertFalse(hrm_decision.allowed)
        self.assertTrue(rcm_decision.allowed)

    def test_snapshot_structure(self):
        allocator = self._make_allocator()
        allocator.record_elapsed("hrm", 3.5)
        snap = allocator.snapshot()
        self.assertIn("enabled", snap)
        self.assertIn("passes", snap)
        self.assertIn("hrm", snap["passes"])
        self.assertIn("rcm", snap["passes"])
        self.assertAlmostEqual(snap["passes"]["hrm"]["query_consumed_ms"], 3.5, places=2)

    def test_build_hrm_compute_budget_policy_factory(self):
        policy = build_hrm_compute_budget_policy(
            enabled=True,
            hrm_max_ms_per_query=15.0,
            rcm_max_ms_per_query=15.0,
            max_total_ms_per_window=300.0,
            window_seconds=120,
        )
        self.assertTrue(policy.enabled)
        self.assertEqual(policy.hrm_max_ms_per_query, 15.0)
        self.assertEqual(policy.window_seconds, 120)


if __name__ == "__main__":
    unittest.main()
