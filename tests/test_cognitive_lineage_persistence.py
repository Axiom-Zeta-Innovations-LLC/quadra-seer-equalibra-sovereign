import os
import sys
import tempfile
import unittest
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))

from hot_memory import AtlanteanHotMemory
from sync import AtlanteanSyncEngine

try:
    from identity import AtlanteanIdentity, CRYPTO_AVAILABLE
except Exception:
    AtlanteanIdentity = None
    CRYPTO_AVAILABLE = False


class TestCognitiveLineagePersistence(unittest.TestCase):
    def test_evolving_cognitive_signatures_and_continuity(self):
        hot = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="lineage-test")
        s0 = hot.snapshot()

        hot.update_Phi(torch.tensor([0.2]))
        s1 = hot.snapshot()

        self.assertNotEqual(s0.get("cognitive_signature"), s1.get("cognitive_signature"))
        self.assertEqual(s1.get("cognitive_signature_prev"), s0.get("cognitive_signature"))

        ok, reason = AtlanteanHotMemory.validate_continuity(s0, s1)
        self.assertTrue(ok, msg=reason)

    def test_cryptographic_cognition_lineage_roundtrip(self):
        if not CRYPTO_AVAILABLE or AtlanteanIdentity is None:
            self.skipTest("cryptography dependency unavailable")

        identity = AtlanteanIdentity(device_id="crypto-lineage")
        hot = AtlanteanHotMemory.initialize(grid_size=(8, 8), identity=identity, device_id="crypto-lineage")
        hot.update_Theta("alpha", 0.4)

        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
            path = tmp.name

        try:
            hot.save(path, identity=identity)
            loaded = AtlanteanHotMemory.load(path, verify_identity=identity)
            self.assertIsNotNone(loaded.lineage_signature_hex)
            self.assertTrue(identity.verify_cognition_lineage(loaded.cognitive_signature, loaded.lineage_signature_hex))
        finally:
            if os.path.exists(path):
                os.remove(path)

    def test_sync_package_preserves_lineage_metadata(self):
        class FakeIdentity:
            def __init__(self):
                self.device_id = "fake-device"

            def sign(self, payload: bytes) -> bytes:
                return b"sig:" + payload[:8]

            def verify(self, payload: bytes, signature: bytes) -> bool:
                return signature.startswith(b"sig:")

        identity = FakeIdentity()
        sync_engine = AtlanteanSyncEngine(identity)
        hot = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="sync-lineage")
        hot.update_phi5(torch.ones_like(hot.phi5) * 0.01)

        package = sync_engine.prepare_sync_package(hot)
        state = package["state"]

        self.assertIn("cognitive_signature", state)
        self.assertIn("cognitive_signature_prev", state)
        self.assertIn("lineage_depth", state)

    def test_long_horizon_behavioral_persistence(self):
        hot = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="long-horizon")
        probe_gen = torch.Generator().manual_seed(7)
        probe = torch.randn((8, 8), generator=probe_gen)

        def behavior_score(mem: AtlanteanHotMemory) -> float:
            return float(torch.mean(mem.phi1 * probe) + 0.1 * torch.mean(mem.phi5) + mem.Phi[0])

        signatures = set()
        continuity_ok = 0
        prev_snapshot = hot.snapshot()

        for i in range(180):
            hot.update_phi1(torch.ones_like(hot.phi1) * (0.0005 if i % 2 == 0 else -0.0004))
            hot.update_phi5(torch.ones_like(hot.phi5) * 0.0002)
            if i % 5 == 0:
                hot.update_Phi(torch.tensor([0.001]))
            if i % 9 == 0:
                hot.update_Theta(f"theta_{i % 4}", float(i) / 200.0)

            curr_snapshot = hot.snapshot()
            ok, _ = AtlanteanHotMemory.validate_continuity(prev_snapshot, curr_snapshot)
            if ok:
                continuity_ok += 1
            prev_snapshot = curr_snapshot
            signatures.add(curr_snapshot.get("cognitive_signature"))

            if i % 45 == 0:
                before = behavior_score(hot)
                with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
                    path = tmp.name
                try:
                    hot.save(path)
                    reloaded = AtlanteanHotMemory.load(path)
                    after = behavior_score(reloaded)
                    self.assertAlmostEqual(before, after, places=7)
                    same_ok, same_reason = AtlanteanHotMemory.validate_continuity(
                        hot.snapshot(),
                        reloaded.snapshot(),
                        allow_equal_version=True,
                    )
                    self.assertTrue(same_ok, msg=same_reason)
                    hot = reloaded
                finally:
                    if os.path.exists(path):
                        os.remove(path)

        self.assertGreaterEqual(continuity_ok, 170)
        self.assertGreater(len(signatures), 160)


if __name__ == "__main__":
    unittest.main()
