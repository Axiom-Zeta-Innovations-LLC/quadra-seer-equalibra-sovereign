import numpy as np

from .config import HRMConfig
from .state import HRMState


def step(state: HRMState, params: HRMConfig) -> float:
    theta = (state.theta + params.omega * params.dt) % (2 * np.pi)
    state.t += params.dt
    return theta
