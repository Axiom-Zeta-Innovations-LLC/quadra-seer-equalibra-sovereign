import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))

from symbolic_reasoner import SymbolicReasoner


class TestSymbolicReasonerAdvanced(unittest.TestCase):
    def test_rule_chaining_and_inference_tree(self):
        with tempfile.TemporaryDirectory() as td:
            state_path = os.path.join(td, "symbolic_state.json")
            reasoner = SymbolicReasoner(persistence_path=state_path)
            out = reasoner.reason(
                "why is this risky",
                context_facts=[
                    "if latency high then risk elevated",
                    "if risk elevated then governance required",
                    "latency high",
                ],
            ).to_dict()

            self.assertIn("forward-chaining", out["rules_fired"])
            self.assertIn("governance required", out["inferred"])
            self.assertGreater(len(out["inference_tree"]), 0)

    def test_contradiction_resolution(self):
        with tempfile.TemporaryDirectory() as td:
            state_path = os.path.join(td, "symbolic_state.json")
            reasoner = SymbolicReasoner(persistence_path=state_path)

            reasoner.reason("safety check", context_facts=["system safe", "not system safe"])
            out = reasoner.reason("safety check", context_facts=["system safe"]).to_dict()

            self.assertIn("contradiction-resolution", out["rules_fired"])
            self.assertGreaterEqual(len(out["contradictions"]), 1)
            self.assertIn("system safe", out["resolved_assertions"])

    def test_persistent_symbolic_state(self):
        with tempfile.TemporaryDirectory() as td:
            state_path = os.path.join(td, "symbolic_state.json")
            r1 = SymbolicReasoner(persistence_path=state_path)
            r1.reason("plan memory aware response", context_facts=["database pressure high"])

            self.assertTrue(os.path.exists(state_path))
            with open(state_path, "r", encoding="utf-8") as fh:
                saved = json.load(fh)
            self.assertIn("propositions", saved)

            r2 = SymbolicReasoner(persistence_path=state_path)
            out = r2.reason("database risk and plan", context_facts=[]).to_dict()
            self.assertGreaterEqual(len(out["memory_hits"]), 1)

    def test_layered_reasoning_schedule_present(self):
        with tempfile.TemporaryDirectory() as td:
            reasoner = SymbolicReasoner(persistence_path=os.path.join(td, "symbolic_state.json"))
            out = reasoner.reason("plan steps and why this failed", context_facts=["risk present"]).to_dict()
            self.assertIn("layer-1-grounding", out["schedule"])
            self.assertIn("layer-3-rule-chaining", out["schedule"])
            self.assertGreaterEqual(len(out["schedule"]), 5)


if __name__ == "__main__":
    unittest.main()
