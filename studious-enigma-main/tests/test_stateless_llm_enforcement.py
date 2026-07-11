import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "atlantean_core"))
sys.path.insert(0, str(ROOT))

from hot_memory import AtlanteanHotMemory
import llm_interface


class TestStatelessLLMEnforcement(unittest.TestCase):
    def test_antipattern_guards_raise(self):
        with self.assertRaises(NotImplementedError):
            llm_interface._ANTI_PATTERN_conversation_history([{"role": "user", "content": "hi"}])

        with self.assertRaises(NotImplementedError):
            llm_interface._ANTI_PATTERN_system_prompt_with_memory("sys", "user")

        with self.assertRaises(NotImplementedError):
            llm_interface._ANTI_PATTERN_agent_scratchpad("notes", "prompt")

    def test_call_llm_with_context_is_prompt_only_and_ephemeral(self):
        hot = AtlanteanHotMemory.initialize(grid_size=(4, 4), device_id="test-llm")
        hot.update_Phi(torch.tensor([0.9]))
        hot.update_Theta("focus", 1.0)

        captured = []

        def fake_api(prompt, **kwargs):
            captured.append((prompt, kwargs))
            return "ok"

        with patch.object(llm_interface, "_llm_api_call", side_effect=fake_api):
            out = llm_interface.call_llm_with_context("What next?", hot, temperature=0.2)

        self.assertEqual(out, "ok")
        self.assertEqual(len(captured), 1)
        sent_prompt, sent_kwargs = captured[0]
        self.assertIn("User: What next?", sent_prompt)
        self.assertIn("Active parameters", sent_prompt)
        self.assertEqual(sent_kwargs.get("temperature"), 0.2)

    def test_call_llm_is_stateless_across_calls(self):
        prompts = []

        def fake_api(prompt, **kwargs):
            prompts.append(prompt)
            return "resp"

        with patch.object(llm_interface, "_llm_api_call", side_effect=fake_api):
            llm_interface.call_llm("p1")
            llm_interface.call_llm("p2")

        self.assertEqual(prompts, ["p1", "p2"])


if __name__ == "__main__":
    unittest.main()
