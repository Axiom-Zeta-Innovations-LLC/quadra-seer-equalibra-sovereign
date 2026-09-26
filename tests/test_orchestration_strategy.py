import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.orchestration_strategy import select_orchestration_strategy


class TestOrchestrationStrategy(unittest.TestCase):
    def test_local_capability_selects_local_direct(self):
        strategy = select_orchestration_strategy(
            {
                "inference_scope": "local",
                "backend": "ollama",
                "context_window": 8192,
                "supports_streaming": True,
                "supports_tool_calls": True,
            },
            cloud_escalation_allowed=False,
        )
        self.assertEqual(strategy["execution_path"], "local_direct")
        self.assertEqual(strategy["strategy_id"], "capability_local_direct")

    def test_cloud_capability_blocked_by_policy(self):
        strategy = select_orchestration_strategy(
            {
                "inference_scope": "cloud",
                "backend": "google-genai",
                "context_window": 1_000_000,
                "supports_streaming": True,
                "supports_tool_calls": True,
            },
            cloud_escalation_allowed=False,
        )
        self.assertEqual(strategy["execution_path"], "cloud_policy_blocked")
        self.assertEqual(strategy["reason_code"], "STRATEGY_CAPABILITY_CLOUD_POLICY_BLOCKED")

    def test_mock_scope_uses_mock_fallback(self):
        strategy = select_orchestration_strategy(
            {
                "inference_scope": "mock",
                "backend": "mock",
                "context_window": 4096,
                "supports_streaming": False,
                "supports_tool_calls": False,
            },
            cloud_escalation_allowed=True,
        )
        self.assertEqual(strategy["execution_path"], "mock_fallback")


if __name__ == "__main__":
    unittest.main()
