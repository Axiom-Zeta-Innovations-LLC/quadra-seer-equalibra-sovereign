import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.corruption_recovery import (
    plan_ledger_recovery,
    plan_snapshot_recovery,
)
from atlantean_core.tamper_evidence import snapshot_hash


class TestCorruptionRecovery(unittest.TestCase):
    def test_snapshot_recovery_prunes_invalid_records(self):
        good_payload = {"phi1": [1.0], "Phi": 0.2, "version": 2}
        good_record = {
            "id": "good",
            "snapshot_sha256": snapshot_hash(good_payload),
        }
        missing_payload_record = {
            "id": "missing",
            "snapshot_sha256": "abc",
        }
        tampered_record = {
            "id": "tampered",
            "snapshot_sha256": "deadbeef",
        }

        plan = plan_snapshot_recovery(
            [good_record, missing_payload_record, tampered_record],
            {
                "good": good_payload,
                "missing": None,
                "tampered": {"phi1": [2.0], "Phi": 0.3, "version": 2},
            },
            verify_hash=True,
        )

        self.assertEqual(plan["recoverable_snapshot_ids"], ["good"])
        self.assertEqual(plan["prune_snapshot_ids"], ["missing", "tampered"])

    def test_ledger_recovery_detects_head_and_seq_repairs(self):
        events = [
            {"seq": 1, "event_hash": "h1"},
            {"seq": 2, "event_hash": "h2"},
        ]
        repair = plan_ledger_recovery(events, stored_head_hash="stale", stored_seq=99)

        self.assertEqual(repair["expected_head_hash"], "h2")
        self.assertEqual(repair["expected_seq"], 2)
        self.assertTrue(repair["head_repair_needed"])
        self.assertTrue(repair["seq_repair_needed"])


if __name__ == "__main__":
    unittest.main()
