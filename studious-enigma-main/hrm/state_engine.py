import numpy as np

from .config import HRMConfig
from .state import HRMState


def _laplacian(grid: np.ndarray) -> np.ndarray:
    return (
        np.roll(grid, 1, axis=0)
        + np.roll(grid, -1, axis=0)
        + np.roll(grid, 1, axis=1)
        + np.roll(grid, -1, axis=1)
        - 4.0 * grid
    )


def step(state: HRMState, params: HRMConfig) -> np.ndarray:
    phi_mean = float(np.mean(state.phi))
    phi_std = float(np.std(state.phi))
    lap = _laplacian(state.phi)

    grad_x = np.diff(state.phi, axis=0, prepend=state.phi[:1, :])
    grad_y = np.diff(state.phi, axis=1, prepend=state.phi[:, :1])

    centered = state.phi - phi_mean
    field_energy = float(np.mean(np.square(state.phi)))
    coherence_proxy = float(np.clip(1.0 - phi_std, 0.0, 1.0))

    ch_den = max(1, params.max_channels - 1)
    dom_den = max(1, params.max_domains - 1)
    lay_den = max(1, params.max_layers - 1)
    proj_den = max(1, params.projection_modes - 1)
    op_den = max(1, params.operational_states - 1)

    guna = np.zeros((3,), dtype=float)
    usable = min(3, state.guna.size)
    guna[:usable] = state.guna[:usable]

    semantic_signal = np.array(
        [
            phi_mean,
            phi_std,
            np.sin(state.theta),
            np.cos(state.theta),
            field_energy,
            coherence_proxy,
            state.channel / ch_den,
            state.domain / dom_den,
            state.layer / lay_den,
            state.projection_mode / proj_den,
            state.operational_state / op_den,
            guna[0],
            guna[1],
            guna[2],
            float(np.mean(lap)),
            float(np.std(lap)),
            float(np.mean(np.abs(grad_x))),
            float(np.mean(np.abs(grad_y))),
            float(np.mean(centered ** 3)),
            float(np.mean(centered ** 4)),
            np.sin(2.0 * state.theta),
            float(guna[0] * phi_std),
            float(guna[1] * (1.0 - np.clip(phi_std, 0.0, 1.0))),
            float(guna[2] * abs(phi_mean)),
        ],
        dtype=float,
    )

    if state.S.shape[0] < semantic_signal.shape[0]:
        return state.S

    next_S = state.S.copy()
    next_S[: semantic_signal.shape[0]] = (
        (1.0 - params.state_gain) * next_S[: semantic_signal.shape[0]]
        + params.state_gain * semantic_signal
    )
    next_S[semantic_signal.shape[0] :] *= 1.0 - (params.state_gain * 0.1)
    return next_S
