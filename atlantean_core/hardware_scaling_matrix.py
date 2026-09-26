"""Hardware scaling matrix for local-first deployments (Step 29).

Defines three deployment tiers and the compute/model/orchestration settings
appropriate for each.  Operators select a tier via env var and the backend
applies the corresponding recommended defaults for model tiers, HRM compute
budget, reasoning budgets, and symbolic reasoning gating.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# Tier definitions
# ---------------------------------------------------------------------------

@dataclass
class HardwareTierSpec:
    """Full resource and orchestration specification for one hardware tier."""

    tier_id: str
    display_name: str
    description: str

    # Representative model IDs for each inference tier.
    model_light: str
    model_standard: str
    model_heavy: str

    # Context window the hardware can sustain.
    context_window: int

    # Maximum number of concurrent query sessions before queuing.
    max_concurrent_sessions: int

    # HRM compute caps.
    hrm_max_ms_per_query: float
    hrm_max_ms_per_window: float
    hrm_window_seconds: int

    # Symbolic / multi-cycle reasoning budgets by query class.
    reasoning_cycles_simple: int
    reasoning_cycles_analytical: int
    reasoning_cycles_deep: int
    reasoning_cycles_file_assisted: int

    # Whether symbolic reasoning is recommended for this tier.
    enable_symbolic_reasoning: bool

    # Model tier pressure threshold (0-1): when HRM window budget consumed
    # above this fraction, downgrade the model tier.
    tier_pressure_threshold: float

    # Indicative minimum RAM and VRAM requirements (informational).
    min_ram_gb: int
    min_vram_gb: int

    # Optional example hardware tags.
    example_hardware: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_TIERS: Dict[str, HardwareTierSpec] = {
    "small_quantized": HardwareTierSpec(
        tier_id="small_quantized",
        display_name="Small Quantized",
        description=(
            "CPU-only or integrated/small discrete GPU deployments. "
            "Targets latency over throughput; symbolic reasoning disabled to "
            "preserve responsiveness."
        ),
        model_light="llama3.2:3b-instruct-q4_K_M",
        model_standard="llama3.2:3b-instruct-q4_K_M",
        model_heavy="llama3.1:8b-instruct-q4_K_M",
        context_window=4096,
        max_concurrent_sessions=1,
        hrm_max_ms_per_query=10.0,
        hrm_max_ms_per_window=80.0,
        hrm_window_seconds=60,
        reasoning_cycles_simple=0,
        reasoning_cycles_analytical=0,
        reasoning_cycles_deep=1,
        reasoning_cycles_file_assisted=0,
        enable_symbolic_reasoning=False,
        tier_pressure_threshold=0.6,
        min_ram_gb=8,
        min_vram_gb=0,
        example_hardware=["CPU-only 8GB RAM", "M1/M2 MacBook Air", "Raspberry Pi 5 (8GB)"],
    ),
    "medium": HardwareTierSpec(
        tier_id="medium",
        display_name="Medium",
        description=(
            "Mid-range GPU workstations and laptops. Supports full symbolic "
            "reasoning with conservative per-query budgets."
        ),
        model_light="llama3.2:3b-instruct-q4_K_M",
        model_standard="llama3.1:8b-instruct-q4_K_M",
        model_heavy="llama3.1:8b-instruct-q8_0",
        context_window=8192,
        max_concurrent_sessions=2,
        hrm_max_ms_per_query=20.0,
        hrm_max_ms_per_window=200.0,
        hrm_window_seconds=60,
        reasoning_cycles_simple=0,
        reasoning_cycles_analytical=1,
        reasoning_cycles_deep=2,
        reasoning_cycles_file_assisted=2,
        enable_symbolic_reasoning=True,
        tier_pressure_threshold=0.8,
        min_ram_gb=16,
        min_vram_gb=8,
        example_hardware=["RTX 3060 12GB", "RTX 4070 12GB", "M1/M2 Pro 16GB"],
    ),
    "multi_agent": HardwareTierSpec(
        tier_id="multi_agent",
        display_name="Multi-Agent",
        description=(
            "High-end workstations and GPU servers. Full symbolic reasoning, "
            "extended context, and multiple concurrent sessions supported."
        ),
        model_light="llama3.1:8b-instruct-q4_K_M",
        model_standard="llama3.1:70b-instruct-q4_K_M",
        model_heavy="mixtral:8x7b-instruct-q4_K_M",
        context_window=32768,
        max_concurrent_sessions=8,
        hrm_max_ms_per_query=50.0,
        hrm_max_ms_per_window=600.0,
        hrm_window_seconds=60,
        reasoning_cycles_simple=1,
        reasoning_cycles_analytical=2,
        reasoning_cycles_deep=4,
        reasoning_cycles_file_assisted=3,
        enable_symbolic_reasoning=True,
        tier_pressure_threshold=0.9,
        min_ram_gb=32,
        min_vram_gb=16,
        example_hardware=["RTX 4090 24GB", "A6000 48GB", "2× RTX 4080 16GB", "Apple M2 Ultra 96GB"],
    ),
}

VALID_TIER_IDS = list(_TIERS.keys())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_tier(tier_id: str) -> HardwareTierSpec | None:
    """Return the spec for *tier_id*, or None if unknown."""
    return _TIERS.get(str(tier_id or "").strip().lower())


def get_tier_or_default(tier_id: str, default: str = "medium") -> HardwareTierSpec:
    """Return the spec for *tier_id*, falling back to *default* if not found."""
    return _TIERS.get(str(tier_id or "").strip().lower(), _TIERS[default])


def list_tiers() -> Dict[str, HardwareTierSpec]:
    """Return the full tier registry."""
    return dict(_TIERS)


def tier_to_dict(spec: HardwareTierSpec) -> Dict[str, Any]:
    """Serialise a HardwareTierSpec to a JSON-safe dict."""
    return {
        "tier_id": spec.tier_id,
        "display_name": spec.display_name,
        "description": spec.description,
        "models": {
            "light": spec.model_light,
            "standard": spec.model_standard,
            "heavy": spec.model_heavy,
        },
        "context_window": spec.context_window,
        "max_concurrent_sessions": spec.max_concurrent_sessions,
        "hrm_compute_budget": {
            "hrm_max_ms_per_query": spec.hrm_max_ms_per_query,
            "max_total_ms_per_window": spec.hrm_max_ms_per_window,
            "window_seconds": spec.hrm_window_seconds,
        },
        "reasoning_budgets": {
            "simple": spec.reasoning_cycles_simple,
            "analytical": spec.reasoning_cycles_analytical,
            "deep": spec.reasoning_cycles_deep,
            "file_assisted": spec.reasoning_cycles_file_assisted,
        },
        "enable_symbolic_reasoning": spec.enable_symbolic_reasoning,
        "tier_pressure_threshold": spec.tier_pressure_threshold,
        "requirements": {
            "min_ram_gb": spec.min_ram_gb,
            "min_vram_gb": spec.min_vram_gb,
        },
        "example_hardware": spec.example_hardware,
    }


def get_scaling_matrix() -> Dict[str, Any]:
    """Return the full serialisable scaling matrix for API/UI consumption."""
    return {
        "schema_version": 1,
        "tiers": {tid: tier_to_dict(spec) for tid, spec in _TIERS.items()},
        "valid_tier_ids": VALID_TIER_IDS,
        "default_tier": "medium",
    }
