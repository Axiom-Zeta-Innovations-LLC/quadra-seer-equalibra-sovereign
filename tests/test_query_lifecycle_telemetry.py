import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.query_lifecycle_telemetry import (
    build_cycle_trigger_payload,
    build_query_lifecycle_payload,
)


class TestQueryLifecycleTelemetry(unittest.TestCase):
    def test_cycle_trigger_payload_ran(self):
        payload = build_cycle_trigger_payload(
            session_id="s1",
            query_class="deep",
            cycle=2,
            decision={
                "ran": True,
                "estimated_cost_ms": 2.5,
                "elapsed_ms": 2.2,
                "tags": ["cap:symbolic_infer"],
                "governance": {"invocations_in_window": 1},
            },
        )
        self.assertEqual(payload["trigger_type"], "symbolic_cycle_ran")
        self.assertTrue(payload["ran"])
        self.assertEqual(payload["cycle"], 2)

    def test_query_lifecycle_summary_payload(self):
        payload = build_query_lifecycle_payload(
            session_id="s1",
            stage="complete",
            query_class="analytical",
            provider_selected="local",
            reasoning_budget={
                "enabled": True,
                "max_cycles": 1,
                "cycles_attempted": 1,
                "cycles_ran": 1,
                "stopped_reason": "cycle_budget_exhausted",
            },
        )
        self.assertEqual(payload["stage"], "complete")
        self.assertEqual(payload["query_class"], "analytical")
        self.assertEqual(payload["reasoning_budget"]["cycles_ran"], 1)


if __name__ == "__main__":
    unittest.main()
