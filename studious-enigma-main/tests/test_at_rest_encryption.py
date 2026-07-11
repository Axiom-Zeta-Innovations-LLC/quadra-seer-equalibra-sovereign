import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))
sys.path.insert(0, str(ROOT))

from at_rest_encryption import AtRestEncryptor
from cold_memory import ColdMemoryItem
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


class TestAtRestEncryption(unittest.TestCase):
    def test_key_rotation_decrypts_old_and_new_tokens(self):
        key_v1 = Fernet.generate_key().decode("utf-8")
        key_v2 = Fernet.generate_key().decode("utf-8")

        enc_v1 = AtRestEncryptor(
            enabled=True,
            keys={"v1": Fernet(key_v1.encode("utf-8")), "v2": Fernet(key_v2.encode("utf-8"))},
            active_key_id="v1",
        )
        token_v1 = enc_v1.encrypt_text("memory-payload")

        enc_v2 = AtRestEncryptor(
            enabled=True,
            keys={"v1": Fernet(key_v1.encode("utf-8")), "v2": Fernet(key_v2.encode("utf-8"))},
            active_key_id="v2",
        )
        token_v2 = enc_v2.encrypt_text("memory-payload")

        self.assertEqual(enc_v2.decrypt_text(token_v1), "memory-payload")
        self.assertEqual(enc_v2.decrypt_text(token_v2), "memory-payload")

    def test_vector_cold_memory_stores_encrypted_rows(self):
        fake_redis = FakeRedis()
        key_v1 = Fernet.generate_key().decode("utf-8")

        def embedder(text):
            rs = np.random.RandomState(abs(hash(text)) % (2 ** 31))
            return rs.randn(16)

        env_patch = {
            "ATLANTEAN_ENCRYPTION_ENABLED": "1",
            "ATLANTEAN_ENCRYPTION_KEYS_JSON": f'{{"v1":"{key_v1}"}}',
            "ATLANTEAN_ENCRYPTION_ACTIVE_KEY_ID": "v1",
        }

        with patch("vector_cold_memory.redis.Redis", return_value=fake_redis), patch.dict(os.environ, env_patch, clear=False):
            mem = VectorColdMemory(embedder=embedder)
            item = ColdMemoryItem("sensitive memory text", {"manifest_id": "m1", "relevance": 0.9})
            mem.attach(item)

            raw_item = fake_redis.get(f"item:{item.id}")
            raw_vector = fake_redis.get(f"vector:{item.id}")
            raw_manifest = fake_redis.get("manifest:m1")

            self.assertIsInstance(raw_item, str)
            self.assertTrue(raw_item.startswith("enc:v1:"))
            self.assertTrue(raw_vector.startswith("enc:v1:"))
            self.assertTrue(raw_manifest.startswith("enc:v1:"))
            self.assertNotIn("sensitive memory text", raw_item)


if __name__ == "__main__":
    unittest.main()
