import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hrm.api_adapter import HRMAdapter
from hrm.config import HRMConfig
from hrm import field_engine


class TestHRMSimulation(unittest.TestCase):
    def test_config_dimensions(self):
        cfg = HRMConfig()
        self.assertEqual(cfg.max_channels, 12)
        self.assertEqual(cfg.max_domains, 22)
        self.assertEqual(cfg.max_layers, 14)
        self.assertEqual(cfg.state_dim, 24)
        self.assertEqual(cfg.guna_components, 3)
        self.assertEqual(cfg.projection_modes, 4)
        self.assertEqual(cfg.operational_states, 88)

    def test_step_timeline_shape_and_bounds(self):
        adapter = HRMAdapter(HRMConfig())
        out = adapter.step(steps=12)
        timeline = out["timeline"]

        self.assertEqual(len(timeline), 12)
        for row in timeline:
            self.assertIn("operator", row)
            self.assertIn("projection_mode", row)
            self.assertIn("operational_state", row)
            self.assertGreaterEqual(row["channel"], 0)
            self.assertLess(row["channel"], adapter.config.max_channels)
            self.assertGreaterEqual(row["domain"], 0)
            self.assertLess(row["domain"], adapter.config.max_domains)
            self.assertGreaterEqual(row["layer"], 0)
            self.assertLess(row["layer"], adapter.config.max_layers)
            self.assertGreaterEqual(row["projection_mode"], 0)
            self.assertLess(row["projection_mode"], adapter.config.projection_modes)
            self.assertGreaterEqual(row["operational_state"], 0)
            self.assertLess(row["operational_state"], adapter.config.operational_states)

    def test_operator_catalog_and_execution(self):
        adapter = HRMAdapter(HRMConfig())
        seen = []

        for idx in range(10):
            adapter.state.operational_state = idx
            adapter.state.phi = field_engine.step(adapter.state, adapter.config)
            seen.append(field_engine.get_active_operator_name(adapter.state))
            self.assertTrue(np.isfinite(adapter.state.phi).all())

        self.assertEqual(len(set(seen)), 10)


if __name__ == "__main__":
    unittest.main()
