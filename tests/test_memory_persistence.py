import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))
sys.path.insert(0, str(ROOT))

from cold_memory import ColdMemoryItem
from hot_memory import AtlanteanHotMemory
from vector_cold_memory import VectorColdMemory


class FakeRedis:
    def __init__(self):
        self._store = {}

    def get(self, key):
        return self._store.get(key)

    def set(self, key, value):
        self._store[key] = value

    def delete(self, key):
        self._store.pop(key, None)

    def keys(self, pattern):
        if pattern.endswith("*"):
            prefix = pattern[:-1]
            return [k for k in self._store if k.startswith(prefix)]
        return [k for k in self._store if k == pattern]


class TestMemoryPersistence(unittest.TestCase):
    def test_hot_memory_save_load_roundtrip(self):
        hot = AtlanteanHotMemory.initialize(grid_size=(8, 8), device_id="test-device")
        hot.update_Theta("alpha", 0.25)
        hot.update_Phi(torch.tensor([0.3]))

        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
            path = tmp.name

        try:
            hot.save(path)
            loaded = AtlanteanHotMemory.load(path)

            self.assertTrue(torch.allclose(hot.phi1, loaded.phi1))
            self.assertTrue(torch.allclose(hot.phi5, loaded.phi5))
            self.assertTrue(torch.allclose(hot.Phi, loaded.Phi))
            self.assertEqual(hot.Theta, loaded.Theta)
            self.assertEqual(hot.device_id, loaded.device_id)
        finally:
            if os.path.exists(path):
                os.remove(path)

    def test_cold_memory_redis_backed_reload(self):
        fake_redis = FakeRedis()

        def embedder(text):
            rs = np.random.RandomState(abs(hash(text)) % (2 ** 31))
            return rs.randn(16)

        with patch("vector_cold_memory.redis.Redis", return_value=fake_redis):
            mem_a = VectorColdMemory(embedder=embedder)
            item = ColdMemoryItem("persistent fact", {"manifest_id": "default", "relevance": 0.8})
            mem_a.attach(item)
            item_id = item.id

            mem_b = VectorColdMemory(embedder=embedder)

            self.assertIn(item_id, mem_b.items)
            self.assertIn(item_id, mem_b.vectors)
            exported = mem_b.export_manifest("default")
            self.assertTrue(exported.get("exists"))
            self.assertGreaterEqual(len(exported.get("items", [])), 1)


if __name__ == "__main__":
    unittest.main()
