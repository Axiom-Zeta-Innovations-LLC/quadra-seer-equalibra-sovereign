from . import cycle_engine, field_engine, optimization_engine, state_engine, topology_engine
from .config import HRMConfig
from .state import HRMState


def run(state: HRMState, params: HRMConfig, T: int = 50) -> list[dict]:
    timeline: list[dict] = []
    for step in range(T):
        state.theta = cycle_engine.step(state, params)
        state.phi = field_engine.step(state, params)
        state.S = state_engine.step(state, params)
        state = topology_engine.route(state, params)
        metrics = optimization_engine.evaluate(state, params)
        optimization_engine.apply(state, metrics, params)

        timeline.append(
            {
                "step": step,
                "t": state.t,
                "theta": float(state.theta),
                "channel": state.channel,
                "domain": state.domain,
                "layer": state.layer,
                "projection_mode": state.projection_mode,
                "operational_state": state.operational_state,
                "operator": field_engine.get_active_operator_name(state),
                "state_vector_head": state.S[:8].tolist(),
                "state_semantic_projection": {
                    "resonance": float(state.S[21]) if state.S.size > 21 else 0.0,
                    "stability": float(state.S[22]) if state.S.size > 22 else 0.0,
                    "transform": float(state.S[23]) if state.S.size > 23 else 0.0,
                },
                "energy": float(state.energy),
                "coherence": float(state.coherence),
                **metrics,
            }
        )

    return timeline
