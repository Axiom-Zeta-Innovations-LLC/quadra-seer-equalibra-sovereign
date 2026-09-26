from dataclasses import asdict

from .config import HRMConfig
from . import field_engine
from .simulation_engine import run
from .state import HRMState, initialize_state


class HRMAdapter:
    def __init__(self, config: HRMConfig | None = None):
        self.config = config or HRMConfig()
        self.state: HRMState = initialize_state(
            state_dim=self.config.state_dim,
            guna_components=self.config.guna_components,
        )

    def reset(self, seed: int | None = None) -> dict:
        self.state = initialize_state(
            state_dim=self.config.state_dim,
            guna_components=self.config.guna_components,
            seed=seed,
        )
        return self.snapshot()

    def step(self, steps: int = 1) -> dict:
        timeline = run(self.state, self.config, T=max(1, steps))
        return {
            "timeline": timeline,
            "snapshot": self.snapshot(),
        }

    def run(self, steps: int = 50) -> dict:
        timeline = run(self.state, self.config, T=max(1, steps))
        return {
            "timeline": timeline,
            "snapshot": self.snapshot(),
        }

    def snapshot(self) -> dict:
        return {
            "t": float(self.state.t),
            "theta": float(self.state.theta),
            "channel": self.state.channel,
            "domain": self.state.domain,
            "layer": self.state.layer,
            "projection_mode": self.state.projection_mode,
            "operational_state": self.state.operational_state,
            "operator": field_engine.get_active_operator_name(self.state),
            "energy": float(self.state.energy),
            "coherence": float(self.state.coherence),
            "phi_shape": list(self.state.phi.shape),
            "S_shape": list(self.state.S.shape),
            "guna": self.state.guna.tolist(),
            "config": asdict(self.config),
        }
