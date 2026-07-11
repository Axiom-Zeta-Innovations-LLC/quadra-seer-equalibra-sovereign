import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.sovereignty_policy import (
    evaluate_cloud_escalation,
    evaluate_local_url_policy,
    is_loopback_url,
)


class TestSovereigntyPolicy(unittest.TestCase):
    def test_loopback_detection(self):
        self.assertTrue(is_loopback_url("http://127.0.0.1:11434/api/generate"))
        self.assertTrue(is_loopback_url("http://localhost:8080/completion"))
        self.assertFalse(is_loopback_url("https://api.external.example/v1"))

    def test_outbound_blocked_for_non_loopback_when_disabled(self):
        decision = evaluate_local_url_policy(
            url="https://api.external.example/v1/completions",
            allow_outbound_network=False,
        )
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "OUTBOUND_BLOCKED_NON_LOOPBACK")

    def test_outbound_loopback_allowed_when_disabled(self):
        decision = evaluate_local_url_policy(
            url="http://127.0.0.1:11434/api/generate",
            allow_outbound_network=False,
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["reason_code"], "OUTBOUND_LOOPBACK_ONLY")

    def test_cloud_escalation_blocked_when_policy_disabled(self):
        decision = evaluate_cloud_escalation(
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=True,
        )
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "CLOUD_ESCALATION_DISABLED_BY_POLICY")

    def test_cloud_escalation_blocked_when_consent_required_missing(self):
        decision = evaluate_cloud_escalation(
            allow_cloud_escalation=True,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "CLOUD_ESCALATION_CONSENT_REQUIRED")

    def test_cloud_escalation_allowed_with_consent(self):
        decision = evaluate_cloud_escalation(
            allow_cloud_escalation=True,
            require_cloud_escalation_consent=True,
            explicit_consent=True,
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["reason_code"], "CLOUD_ESCALATION_ALLOWED_WITH_CONSENT")


if __name__ == "__main__":
    unittest.main()
