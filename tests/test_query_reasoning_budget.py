import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "atlantean_core"))

from atlantean_core.query_reasoning_budget import (
    build_query_reasoning_budget,
    classify_query_class,
)


class TestQueryReasoningBudget(unittest.TestCase):
    def test_classify_file_assisted(self):
        qc = classify_query_class("Summarize this", has_files=True)
        self.assertEqual(qc, "file_assisted")

    def test_classify_deep_and_simple(self):
        deep = classify_query_class("Please provide a proof with architecture tradeoff constraints", has_files=False)
        simple = classify_query_class("Hi", has_files=False)
        self.assertEqual(deep, "deep")
        self.assertEqual(simple, "simple")

    def test_budget_plan_uses_query_class_cycles(self):
        plan = build_query_reasoning_budget(
            "analytical",
            enabled=True,
            cycles_by_class={
                "simple": 0,
                "analytical": 1,
                "deep": 2,
                "file_assisted": 2,
            },
        )
        self.assertTrue(plan["enabled"])
        self.assertEqual(plan["query_class"], "analytical")
        self.assertEqual(plan["max_cycles"], 1)
        self.assertTrue(plan["force_symbolic"])


if __name__ == "__main__":
    unittest.main()
