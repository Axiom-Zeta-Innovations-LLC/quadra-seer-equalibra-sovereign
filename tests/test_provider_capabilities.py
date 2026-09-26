import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.provider_capabilities import (
    build_provider_capability_registry,
    normalize_provider_name,
    resolve_provider_capability,
)


class TestProviderCapabilities(unittest.TestCase):
    def test_normalize_alias_to_local(self):
        self.assertEqual(normalize_provider_name("ollama"), "local")
        self.assertEqual(normalize_provider_name("vllm"), "local")
        self.assertEqual(normalize_provider_name("unknown"), "")

    def test_registry_exposes_required_capabilities(self):
        registry = build_provider_capability_registry(
            local_backend="ollama",
            local_model="llama3.1",
            local_context_window=8192,
        )
        local = registry["local"]

        self.assertEqual(local["context_window"], 8192)
        self.assertEqual(local["inference_scope"], "local")
        self.assertTrue(local["supports_streaming"])
        self.assertTrue(local["supports_tool_calls"])

    def test_resolution_falls_back_to_default(self):
        registry = build_provider_capability_registry(
            local_backend="llama.cpp",
            local_model="q4",
            local_context_window=4096,
        )
        resolved = resolve_provider_capability("nonexistent", registry, default_provider="local")

        self.assertEqual(resolved["provider_selected"], "local")
        self.assertTrue(resolved["fallback_used"])
        self.assertIn("context_window", resolved["capability"])


if __name__ == "__main__":
    unittest.main()
