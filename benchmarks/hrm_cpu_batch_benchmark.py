#!/usr/bin/env python3
"""
CPU batch benchmark for HRM simulation/training-style stepping.

Usage:
  python benchmarks/hrm_cpu_batch_benchmark.py --batch-size 32 --steps 200 --epochs 5
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hrm.config import HRMConfig
from hrm.state import initialize_state
from hrm.simulation_engine import run


def benchmark(batch_size: int, steps: int, epochs: int, seed: int = 123) -> dict:
    cfg = HRMConfig()
    rng = np.random.default_rng(seed)

    states = [
        initialize_state(state_dim=cfg.state_dim, guna_components=cfg.guna_components, seed=int(rng.integers(1, 1_000_000)))
        for _ in range(batch_size)
    ]

    started = time.perf_counter()
    per_epoch = []

    for _ in range(epochs):
        e0 = time.perf_counter()
        for state in states:
            run(state, cfg, T=steps)
        per_epoch.append(time.perf_counter() - e0)

    elapsed = time.perf_counter() - started
    total_state_steps = batch_size * steps * epochs
    throughput = total_state_steps / elapsed if elapsed > 0 else 0.0

    return {
        "batch_size": batch_size,
        "steps_per_state": steps,
        "epochs": epochs,
        "total_state_steps": total_state_steps,
        "elapsed_seconds": round(elapsed, 6),
        "throughput_state_steps_per_sec": round(throughput, 3),
        "epoch_seconds": [round(v, 6) for v in per_epoch],
        "hrm_config": {
            "channels": cfg.max_channels,
            "domains": cfg.max_domains,
            "layers": cfg.max_layers,
            "state_dim": cfg.state_dim,
            "projection_modes": cfg.projection_modes,
            "operational_states": cfg.operational_states,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="HRM CPU batch benchmark")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--steps", type=int, default=100)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON only")
    args = parser.parse_args()

    result = benchmark(args.batch_size, args.steps, args.epochs)
    if args.json:
        print(json.dumps(result))
        return 0

    print("=" * 64)
    print("HRM CPU Batch Benchmark")
    print("=" * 64)
    print(f"Batch size: {result['batch_size']}")
    print(f"Steps/state: {result['steps_per_state']}")
    print(f"Epochs: {result['epochs']}")
    print(f"Total state-steps: {result['total_state_steps']}")
    print(f"Elapsed: {result['elapsed_seconds']} s")
    print(f"Throughput: {result['throughput_state_steps_per_sec']} state-steps/s")
    print(f"Epoch times: {result['epoch_seconds']}")
    print("Config:", result["hrm_config"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
