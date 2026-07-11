import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.ledger_verification import evaluate_ledger_gate


class TestLedgerVerification(unittest.TestCase):
    def test_blocks_invalid_chain(self):
        decision = evaluate_ledger_gate(
            ledger_report={"valid": False, "issues": [{"type": "hash_mismatch"}]},
            replay_proof={"valid": True, "match": True, "replay_state_hash": "abc"},
        )
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "LEDGER_CHAIN_INVALID")

    def test_blocks_replay_mismatch_when_required(self):
        decision = evaluate_ledger_gate(
            ledger_report={"valid": True, "issues": []},
            replay_proof={
                "valid": True,
                "match": False,
                "replay_state_hash": "abc",
                "live_state_hash": "def",
            },
            require_replay_match=True,
        )
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "LEDGER_REPLAY_STATE_MISMATCH")

    def test_allows_valid_empty_ledger(self):
        decision = evaluate_ledger_gate(
            ledger_report={"valid": True, "issues": []},
            replay_proof={"valid": True, "match": False, "replay_state_hash": None},
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["reason_code"], "LEDGER_VERIFIED_EMPTY_OR_NO_REPLAY_BASELINE")

    def test_allows_verified_replay(self):
        decision = evaluate_ledger_gate(
            ledger_report={"valid": True, "issues": []},
            replay_proof={"valid": True, "match": True, "replay_state_hash": "abc"},
        )
        self.assertTrue(decision["allowed"])
        self.assertEqual(decision["reason_code"], "LEDGER_VERIFIED_WITH_REPLAY")


if __name__ == "__main__":
    unittest.main()
