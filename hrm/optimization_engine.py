import numpy as np

from .config import HRMConfig
from .state import HRMState


def evaluate(state: HRMState, params: HRMConfig) -> dict:
    phi_energy = float(np.mean(np.square(state.phi)))
    state_energy = float(np.mean(np.square(state.S)))
    coherence = float(np.clip(1.0 - np.std(state.phi), 0.0, 1.0))
    return {
        "phi_energy": phi_energy,
        "state_energy": state_energy,
        "coherence": coherence,
        "total_energy": phi_energy + state_energy,
    }


def apply(state: HRMState, metrics: dict, params: HRMConfig) -> None:
    state.energy = (1.0 - params.energy_decay) * state.energy + params.energy_decay * metrics["total_energy"]
    state.coherence = (1.0 - params.coherence_gain) * state.coherence + params.coherence_gain * metrics["coherence"]

    # Adapt guna weights towards coherent / low-energy dynamics.
    base_target = np.array(
        [
            0.3 + 0.4 * state.coherence,
            0.4 - 0.2 * state.coherence,
            0.3 + 0.2 * (1.0 - min(state.energy, 1.0)),
        ],
        dtype=float,
    )

    guna_count = int(max(1, params.guna_components))
    if guna_count == 3:
        target = base_target
    else:
        target = np.full((guna_count,), 1.0 / guna_count, dtype=float)
        target[: min(3, guna_count)] = base_target[: min(3, guna_count)]

    target = np.clip(target, 0.05, 0.9)
    target /= np.sum(target)
    state.guna = 0.9 * state.guna + 0.1 * target
