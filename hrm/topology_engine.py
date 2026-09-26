import numpy as np

from .config import HRMConfig
from .state import HRMState


def _domain_transition_delta(state: HRMState, params: HRMConfig) -> int:
    """Domain transition logic.

    score = 0.55*s6 + 0.25*s21 - 0.20*s22 + 0.15*(s14-s15)
    """
    s = state.S
    score = 0.0
    if s.size > 22:
        score = 0.55 * float(s[6]) + 0.25 * float(s[21]) - 0.20 * float(s[22]) + 0.15 * (float(s[14]) - float(s[15]))
    if score > params.topology_threshold:
        return 1
    if score < -params.topology_threshold:
        return -1
    return 0


def _layer_projection_signal(state: HRMState, params: HRMConfig) -> float:
    """Layer projection mathematics across four projection modes.

    mode 0: linear projection
    mode 1: harmonic-topological projection
    mode 2: guna-weighted projection
    mode 3: structural differential projection
    """
    s = state.S
    mode = int(state.projection_mode) % max(1, params.projection_modes)

    if mode == 0:
        return 0.6 * float(s[4]) + 0.4 * float(s[5]) if s.size > 5 else 0.0
    if mode == 1:
        if s.size > 15:
            return float(np.tanh((float(s[14]) - float(s[15])) + np.sin(state.theta)))
        return float(np.sin(state.theta))
    if mode == 2:
        if s.size > 23:
            guna = np.zeros((3,), dtype=float)
            usable = min(3, state.guna.size)
            guna[:usable] = state.guna[:usable]
            vec = np.array([float(s[21]), float(s[22]), float(s[23])], dtype=float)
            return float(np.dot(guna, vec))
        return float(np.mean(state.guna)) if state.guna.size else 0.0

    # mode 3
    ch_den = max(1, params.max_channels - 1)
    dom_den = max(1, params.max_domains - 1)
    lay_den = max(1, params.max_layers - 1)
    structural = (state.channel / ch_den) - (state.domain / dom_den) + (state.layer / lay_den)
    return float(np.tanh(structural))


def _update_guna(state: HRMState, params: HRMConfig) -> None:
    """Guṇa interaction equations (3-component nonlinear interaction).

    dg0/dt = g0*(g1-g2) + 0.25*s5
    dg1/dt = g1*(g2-g0) + 0.20*(1-s4)
    dg2/dt = g2*(g0-g1) + 0.15*|s0|
    """
    if state.guna.size < 3:
        return

    s = state.S
    s0 = float(s[0]) if s.size > 0 else 0.0
    s4 = float(s[4]) if s.size > 4 else 0.0
    s5 = float(s[5]) if s.size > 5 else 0.0

    g = state.guna.astype(float).copy()
    dg0 = g[0] * (g[1] - g[2]) + 0.25 * s5
    dg1 = g[1] * (g[2] - g[0]) + 0.20 * (1.0 - np.clip(s4, 0.0, 1.0))
    dg2 = g[2] * (g[0] - g[1]) + 0.15 * abs(s0)

    lr = params.state_gain * 0.5
    g[0] += lr * dg0
    g[1] += lr * dg1
    g[2] += lr * dg2

    g = np.clip(g, 1e-6, None)
    g /= np.sum(g)
    state.guna[:3] = g


def _transition_operational_state(state: HRMState, params: HRMConfig, domain_delta: int, layer_delta: int, projection_signal: float) -> int:
    """Operational transition rules over 88 states.

    next = (base + phase_bucket + guna_bucket_offset) mod 88
    where base = current + 7*domain_delta + 11*layer_delta + 5*sign(projection)
    """
    current = int(state.operational_state)
    base = current + (7 * domain_delta) + (11 * layer_delta) + (5 * int(np.sign(projection_signal)))

    phase = float(state.theta % (2.0 * np.pi))
    phase_bucket = int((phase / (2.0 * np.pi)) * 8.0)  # 0..7
    guna_bucket = int(np.argmax(state.guna[:3])) if state.guna.size >= 3 else 0
    guna_bucket_offset = [0, 29, 58][guna_bucket]

    return int((base + phase_bucket + guna_bucket_offset) % params.operational_states)


def route(state: HRMState, params: HRMConfig) -> HRMState:
    s0 = float(state.S[0]) if state.S.size else 0.0
    s1 = float(state.S[1]) if state.S.size > 1 else 0.0

    if abs(s0) > params.topology_threshold:
        state.channel = (state.channel + (1 if s0 > 0 else -1)) % params.max_channels

    domain_delta = _domain_transition_delta(state, params)
    if domain_delta == 0 and abs(s1) > params.topology_threshold:
        domain_delta = 1 if s1 > 0 else -1
    if domain_delta:
        state.domain = (state.domain + domain_delta) % params.max_domains

    layer_signal = _layer_projection_signal(state, params)
    layer_delta = 0
    if abs(layer_signal) > params.topology_threshold:
        layer_delta = 1 if layer_signal > 0 else -1
        state.layer = (state.layer + layer_delta) % params.max_layers

    s2 = float(state.S[2]) if state.S.size > 2 else 0.0
    if abs(s2) > params.topology_threshold:
        state.projection_mode = (state.projection_mode + (1 if s2 > 0 else -1)) % params.projection_modes

    _update_guna(state, params)
    state.operational_state = _transition_operational_state(
        state,
        params,
        domain_delta=domain_delta,
        layer_delta=layer_delta,
        projection_signal=layer_signal,
    )

    return state
