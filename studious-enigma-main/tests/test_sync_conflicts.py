import sys
import unittest
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))
sys.path.insert(0, str(ROOT))

from hot_memory import AtlanteanHotMemory
from sync import AtlanteanSyncEngine, MergeStrategy, merge_hot_memories


class FakeIdentity:
    def __init__(self, device_id="device-A"):
        self.device_id = device_id

    def sign(self, payload: bytes) -> bytes:
        return b"sig:" + payload[:8]

    def verify(self, payload: bytes, signature: bytes) -> bool:
        return signature.startswith(b"sig:")


class TestSyncConflicts(unittest.TestCase):
    def test_simple_merge_preserves_plasticity(self):
        local = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="local")
        remote = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="remote")

        local.phi5 = torch.ones_like(local.phi5) * 0.2
        local.version = 1
        remote.phi5 = torch.ones_like(remote.phi5) * 0.7
        remote.version = 2
        snapshot = remote.snapshot()

        merge_hot_memories(local, snapshot, alpha=0.5)

        self.assertTrue(torch.all(local.phi5 >= 0.7 - 1e-8))
        self.assertGreaterEqual(local.version, snapshot["version"])

    def test_conflict_merge_with_vector_clock_engine(self):
        identity_a = FakeIdentity("A")
        identity_b = FakeIdentity("B")
        sync_a = AtlanteanSyncEngine(identity_a)
        sync_b = AtlanteanSyncEngine(identity_b)

        local = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="A")
        remote = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="B")

        local.phi5 = torch.ones_like(local.phi5) * 0.25
        remote.phi5 = torch.ones_like(remote.phi5) * 0.85

        package = sync_b.prepare_sync_package(remote)
        merged = sync_a.merge(local, package, strategy=MergeStrategy.CONSERVATIVE)

        self.assertIsNotNone(merged)
        self.assertTrue(torch.all(merged.phi5 >= 0.25 - 1e-8))
        self.assertEqual(merged.phi1.shape, local.phi1.shape)


if __name__ == "__main__":
    unittest.main()
