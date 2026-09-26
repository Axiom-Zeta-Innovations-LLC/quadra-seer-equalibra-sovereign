import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hrm.config import HRMConfig
from hrm.state import initialize_state, get_state_variable_semantics
from hrm import field_engine


class TestOperatorGraphValidation(unittest.TestCase):
    def setUp(self):
        self.cfg = HRMConfig()
        self.state = initialize_state(
            state_dim=self.cfg.state_dim,
            guna_components=self.cfg.guna_components,
            seed=17,
        )

    def test_state_semantics_cover_all_24_variables(self):
        semantics = get_state_variable_semantics()
        self.assertEqual(len(semantics), 24)
        self.assertEqual({entry["index"] for entry in semantics}, set(range(24)))

    def test_each_operator_apply_shape_finiteness_and_boundedness(self):
        ops = field_engine.OPERATOR_CATALOG
        self.assertEqual(len(ops), 10)

        for op in ops:
            dphi = op.apply(self.state, self.state.phi.copy(), self.cfg)
            self.assertEqual(dphi.shape, self.state.phi.shape, msg=f"shape mismatch in {op.name}")
            self.assertTrue(np.isfinite(dphi).all(), msg=f"non-finite values in {op.name}")
            # Boundedness guardrail for default config / initialization.
            self.assertLess(float(np.max(np.abs(dphi))), 1e6, msg=f"unbounded derivative in {op.name}")

    def test_execution_graph_consistency(self):
        graph = field_engine.get_operator_execution_graph()
        catalog_names = [op.name for op in field_engine.OPERATOR_CATALOG]

        self.assertEqual(sorted(graph["nodes"]), sorted(catalog_names))

        node_set = set(graph["nodes"])
        for src, dst in graph["edges"]:
            self.assertIn(src, node_set)
            self.assertIn(dst, node_set)

        pipelines = field_engine.get_compositional_pipelines()
        for pipeline_name, op_names in pipelines.items():
            self.assertGreater(len(op_names), 0, msg=f"empty pipeline {pipeline_name}")
            for op_name in op_names:
                self.assertIn(op_name, node_set, msg=f"unknown operator {op_name} in pipeline {pipeline_name}")


if __name__ == "__main__":
    unittest.main()
