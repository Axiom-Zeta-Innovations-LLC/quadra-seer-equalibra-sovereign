import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))

from governance import GovernanceController, GovernancePolicy
from scheduler import ComputeGatingControls, ComputeScheduler
from symbolic_reasoner import SymbolicReasoner


class TestComputeGating(unittest.TestCase):
    def test_scheduler_blocks_when_disabled(self):
        scheduler = ComputeScheduler(ComputeGatingControls(enable_symbolic_reasoning=False))
        scheduler.tick()
        out = scheduler.run_symbolic_if_allowed(
            reasoner=SymbolicReasoner(),
            governance=GovernanceController(GovernancePolicy()),
            query="plan this",
        )
        self.assertFalse(out["ran"])

    def test_scheduler_runs_on_cadence(self):
        controls = ComputeGatingControls(enable_symbolic_reasoning=True, symbolic_every_n_queries=2)
        scheduler = ComputeScheduler(controls)
        gov = GovernanceController(GovernancePolicy())
        reasoner = SymbolicReasoner()

        scheduler.tick()
        out1 = scheduler.run_symbolic_if_allowed(reasoner, gov, "why this system")
        self.assertFalse(out1["ran"])

        scheduler.tick()
        out2 = scheduler.run_symbolic_if_allowed(reasoner, gov, "why this system")
        self.assertTrue(out2["ran"])
        self.assertIn("result", out2)
        self.assertIn("rules_fired", out2["result"])

    def test_governance_denies_after_invocation_limit(self):
        policy = GovernancePolicy(
            allow_symbolic_reasoning=True,
            window_seconds=60,
            max_symbolic_invocations_per_window=1,
            max_symbolic_compute_ms_per_window=1000.0,
            max_single_symbolic_compute_ms=1000.0,
        )
        gov = GovernanceController(policy)
        d1 = gov.authorize("symbolic_reasoning", 1.0)
        self.assertTrue(d1.allowed)
        gov.record_execution("symbolic_reasoning", 1.0)

        d2 = gov.authorize("symbolic_reasoning", 1.0)
        self.assertFalse(d2.allowed)
        self.assertEqual(d2.reason, "invocation-rate-limit")


if __name__ == "__main__":
    unittest.main()
