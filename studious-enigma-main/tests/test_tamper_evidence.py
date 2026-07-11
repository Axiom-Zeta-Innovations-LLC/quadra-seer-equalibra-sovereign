import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.tamper_evidence import (
    snapshot_hash,
    verify_replay_head,
    verify_snapshot_hash,
)


class TestTamperEvidence(unittest.TestCase):
    def test_snapshot_hash_changes_on_mutation(self):
        snapshot = {
            "phi1": [1, 2, 3],
            "Phi": 0.4,
            "version": 5,
        }
        digest_a = snapshot_hash(snapshot)

        tampered = dict(snapshot)
        tampered["Phi"] = 0.5
        digest_b = snapshot_hash(tampered)

        self.assertNotEqual(digest_a, digest_b)
        self.assertTrue(verify_snapshot_hash(snapshot, digest_a))
        self.assertFalse(verify_snapshot_hash(tampered, digest_a))

    def test_replay_head_consistency(self):
        self.assertTrue(verify_replay_head("abc", "abc"))
        self.assertFalse(verify_replay_head("abc", "def"))


if __name__ == "__main__":
    unittest.main()
