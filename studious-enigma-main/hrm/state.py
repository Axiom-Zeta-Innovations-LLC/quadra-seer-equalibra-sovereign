from dataclasses import dataclass

import numpy as np

from .config import HRMConfig


STATE_VARIABLE_SEMANTICS = (
    {"index": 0, "name": "phi_mean", "meaning": "Mean field amplitude", "equation": "s0 = mean(phi)"},
    {"index": 1, "name": "phi_std", "meaning": "Field dispersion / uncertainty", "equation": "s1 = std(phi)"},
    {"index": 2, "name": "phase_sin", "meaning": "Cycle sine phase embedding", "equation": "s2 = sin(theta)"},
    {"index": 3, "name": "phase_cos", "meaning": "Cycle cosine phase embedding", "equation": "s3 = cos(theta)"},
    {"index": 4, "name": "field_energy", "meaning": "Quadratic field energy", "equation": "s4 = mean(phi^2)"},
    {"index": 5, "name": "coherence_proxy", "meaning": "Instant coherence proxy", "equation": "s5 = clip(1-std(phi),0,1)"},
    {"index": 6, "name": "channel_norm", "meaning": "Normalized channel index", "equation": "s6 = channel/(C-1)"},
    {"index": 7, "name": "domain_norm", "meaning": "Normalized domain index", "equation": "s7 = domain/(D-1)"},
    {"index": 8, "name": "layer_norm", "meaning": "Normalized layer index", "equation": "s8 = layer/(L-1)"},
    {"index": 9, "name": "projection_mode_norm", "meaning": "Normalized projection-mode index", "equation": "s9 = projection_mode/(P-1)"},
    {"index": 10, "name": "operational_state_norm", "meaning": "Normalized operational state", "equation": "s10 = op_state/(O-1)"},
    {"index": 11, "name": "guna_sattva", "meaning": "Sattva component", "equation": "s11 = guna[0]"},
    {"index": 12, "name": "guna_rajas", "meaning": "Rajas component", "equation": "s12 = guna[1]"},
    {"index": 13, "name": "guna_tamas", "meaning": "Tamas component", "equation": "s13 = guna[2]"},
    {"index": 14, "name": "lap_mean", "meaning": "Mean Laplacian pressure", "equation": "s14 = mean(lap(phi))"},
    {"index": 15, "name": "lap_std", "meaning": "Laplacian dispersion", "equation": "s15 = std(lap(phi))"},
    {"index": 16, "name": "grad_x_energy", "meaning": "Horizontal gradient energy", "equation": "s16 = mean(|dphi/dx|)"},
    {"index": 17, "name": "grad_y_energy", "meaning": "Vertical gradient energy", "equation": "s17 = mean(|dphi/dy|)"},
    {"index": 18, "name": "centered_skew", "meaning": "Centered cubic moment", "equation": "s18 = mean((phi-mean(phi))^3)"},
    {"index": 19, "name": "centered_kurt", "meaning": "Centered quartic moment", "equation": "s19 = mean((phi-mean(phi))^4)"},
    {"index": 20, "name": "phase_harmonic", "meaning": "Second harmonic phase", "equation": "s20 = sin(2*theta)"},
    {"index": 21, "name": "resonance_index", "meaning": "Sattva-weighted oscillatory resonance", "equation": "s21 = guna[0]*std(phi)"},
    {"index": 22, "name": "stability_index", "meaning": "Rajas-weighted stability reserve", "equation": "s22 = guna[1]*(1-clip(std(phi),0,1))"},
    {"index": 23, "name": "transform_index", "meaning": "Tamas-weighted transformation pressure", "equation": "s23 = guna[2]*|mean(phi)|"},
)


@dataclass
class HRMState:
    t: float
    theta: float
    channel: int
    domain: int
    layer: int
    projection_mode: int
    operational_state: int
    phi: np.ndarray
    S: np.ndarray
    guna: np.ndarray
    energy: float = 0.0
    coherence: float = 0.0


def get_state_variable_semantics() -> tuple[dict, ...]:
    """Return formal semantic definitions for the 24-component HRM state vector."""
    return STATE_VARIABLE_SEMANTICS


def initialize_state(
    grid_shape: tuple[int, int] = (32, 32),
    state_dim: int | None = None,
    guna_components: int | None = None,
    seed: int | None = None,
) -> HRMState:
    if state_dim is None:
        state_dim = HRMConfig().state_dim
    if guna_components is None:
        guna_components = HRMConfig().guna_components

    rng = np.random.default_rng(seed)
    phi = rng.normal(0.0, 0.1, size=grid_shape)
    S = rng.normal(0.0, 0.1, size=(state_dim,))
    guna = np.full((guna_components,), 1.0 / max(guna_components, 1), dtype=float)
    return HRMState(
        t=0.0,
        theta=0.0,
        channel=0,
        domain=0,
        layer=0,
        projection_mode=0,
        operational_state=0,
        phi=phi,
        S=S,
        guna=guna,
    )
