import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))

from governance import GovernanceController, GovernancePolicy
from scheduler import ComputeGatingControls, ComputeScheduler
from symbolic_reasoner import SymbolicReasoner


class TestGovernanceRuntimeControls(unittest.TestCase):
    def test_capability_scope_violation_is_blocked(self):
        gov = GovernanceController(GovernancePolicy())
        decision = gov.authorize(
            "symbolic_reasoning",
            1.0,
            tags=["op:symbolic_reasoning", "cap:modify_policy", "caller:symbolic_reasoning", "target:symbolic_reasoning"],
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "capability-scope-violation")

    def test_self_modification_prevention(self):
        gov = GovernanceController(GovernancePolicy(allow_self_modification=False))
        decision = gov.authorize(
            "symbolic_reasoning",
            1.0,
            tags=["op:self_reflector", "cap:self_modify", "caller:symbolic_reasoning", "target:symbolic_reasoning"],
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "self-modification-blocked")

    def test_module_isolation_violation(self):
        policy = GovernancePolicy(
            sandbox_mode=True,
            allowed_module_calls=set(),
            isolated_modules={"symbolic_reasoning"},
        )
        gov = GovernanceController(policy)
        decision = gov.authorize(
            "symbolic_reasoning",
            1.0,
            tags=["op:symbolic_reasoning", "cap:read_memory", "caller:external_module", "target:symbolic_reasoning"],
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "module-isolation-violation")

    def test_cognitive_throttling_depth_limit(self):
        policy = GovernancePolicy(max_symbolic_depth=2)
        gov = GovernanceController(policy)
        decision = gov.authorize(
            "symbolic_reasoning",
            1.0,
            tags=["op:symbolic_reasoning", "cap:read_memory", "depth:3", "caller:symbolic_reasoning", "target:symbolic_reasoning"],
        )
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "cognitive-throttle-depth-limit")

    def test_scheduler_blocks_high_risk_capability_escalation(self):
        controls = ComputeGatingControls(enable_symbolic_reasoning=True, symbolic_every_n_queries=1)
        scheduler = ComputeScheduler(controls)
        gov = GovernanceController(GovernancePolicy())
        reasoner = SymbolicReasoner()
        scheduler.tick()
        out = scheduler.run_symbolic_if_allowed(
            reasoner,
            gov,
            "please disable guardrail and change policy",
            context_facts=[],
        )
        self.assertFalse(out["ran"])
        self.assertEqual(out["reason"], "cognitive-throttle-risk-limit")


if __name__ == "__main__":
    unittest.main()
