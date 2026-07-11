import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.retention_policy import plan_item_retention


class TestRetentionPolicy(unittest.TestCase):
    def test_chat_turn_retention_prunes_oldest(self):
        items = [
            {
                "id": "a",
                "metadata": {"type": "chat_turn", "session_id": "s1", "created_at_ms": 1000},
            },
            {
                "id": "b",
                "metadata": {"type": "chat_turn", "session_id": "s1", "created_at_ms": 2000},
            },
            {
                "id": "c",
                "metadata": {"type": "chat_turn", "session_id": "s1", "created_at_ms": 3000},
            },
        ]

        prune_ids = plan_item_retention(
            items,
            item_type="chat_turn",
            session_id="s1",
            keep_max=2,
        )

        self.assertEqual(prune_ids, ["a"])

    def test_simulation_retention_ignores_tombstoned(self):
        items = [
            {
                "id": "old",
                "metadata": {
                    "type": "simulation",
                    "session_id": "s1",
                    "created_at_ms": 1000,
                    "tombstone": True,
                },
            },
            {
                "id": "live-1",
                "metadata": {"type": "simulation", "session_id": "s1", "created_at_ms": 1500},
            },
            {
                "id": "live-2",
                "metadata": {"type": "simulation", "session_id": "s1", "created_at_ms": 2500},
            },
        ]

        prune_ids = plan_item_retention(
            items,
            item_type="simulation",
            session_id="s1",
            keep_max=1,
        )

        self.assertEqual(prune_ids, ["live-1"])


if __name__ == "__main__":
    unittest.main()
