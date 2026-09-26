from dataclasses import dataclass

import numpy as np

from .config import HRMConfig
from .state import HRMState

OPERATOR_NAMES = [
    "The Architect",
    "The Messenger",
    "The Transformer",
    "The Smoother",
    "The Regulator",
    "The Filter",
    "The Foundation",
    "The Magnet",
    "The Attractor",
    "The Finisher",
]


def _laplacian(grid: np.ndarray) -> np.ndarray:
    return (
        np.roll(grid, 1, axis=0)
        + np.roll(grid, -1, axis=0)
        + np.roll(grid, 1, axis=1)
        + np.roll(grid, -1, axis=1)
        - 4.0 * grid
    )


def _biharmonic(grid: np.ndarray) -> np.ndarray:
    return _laplacian(_laplacian(grid))


def _triharmonic(grid: np.ndarray) -> np.ndarray:
    return _laplacian(_biharmonic(grid))


@dataclass(frozen=True)
class FormalPDE:
    name: str
    equation: str


class BaseOperator:
    name = "Base"
    pde = FormalPDE(name="Base", equation="dphi/dt = 0")

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        raise NotImplementedError


class ArchitectOperator(BaseOperator):
    name = "The Architect"
    pde = FormalPDE(
        name=name,
        equation="dphi_2/dt = D2 lap(phi_2) + lambda2 sin(phi_2) + eta2 lap(phi_2^3)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return (
            params.field_diffusion * lap
            + params.architect_lambda2 * np.sin(field)
            + params.architect_eta2 * _laplacian(field ** 3)
        )


class MessengerOperator(BaseOperator):
    name = "The Messenger"
    pde = FormalPDE(
        name=name,
        equation="dphi_3/dt = D3 lap(phi_3) + kappa3 phi_3 (1 - |phi_3|^2)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return params.field_diffusion * lap + params.messenger_kappa3 * field * (1.0 - np.abs(field) ** 2)


class TransformerOperator(BaseOperator):
    name = "The Transformer"
    pde = FormalPDE(
        name=name,
        equation="dphi_4/dt = D4 lap(phi_4) - mu4 phi_4^5 + nu4 lap^2(phi_4)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return (
            params.field_diffusion * lap
            - params.transformer_mu4 * (field ** 5)
            + params.transformer_nu4 * _biharmonic(field)
        )


class SmootherOperator(BaseOperator):
    name = "The Smoother"
    pde = FormalPDE(
        name=name,
        equation="dphi_5/dt = D5 lap(phi_5) + omega5 phi_5 log(eps + |phi_5|)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return params.field_diffusion * lap + params.smoother_omega5 * field * np.log(params.smoother_eps + np.abs(field))


class RegulatorOperator(BaseOperator):
    name = "The Regulator"
    pde = FormalPDE(
        name=name,
        equation="dphi_6/dt = D6 lap(phi_6) + xi6 phi_6^3 - zeta6 lap(phi_6)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return (params.field_diffusion - params.regulator_zeta6) * lap + params.regulator_xi6 * (field ** 3)


class FilterOperator(BaseOperator):
    name = "The Filter"
    pde = FormalPDE(
        name=name,
        equation="dphi_7/dt = D7 lap(phi_7) + sigma7 phi_7 - tau7 lap^2(phi_7)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return params.field_diffusion * lap + params.filter_sigma7 * field - params.filter_tau7 * _biharmonic(field)


class FoundationOperator(BaseOperator):
    name = "The Foundation"
    pde = FormalPDE(
        name=name,
        equation="dphi_8/dt = D8 lap(phi_8) + tau8 sinh(phi_8)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        clipped = np.clip(field, -8.0, 8.0)
        return params.field_diffusion * lap + params.foundation_tau8 * np.sinh(clipped)


class MagnetOperator(BaseOperator):
    name = "The Magnet"
    pde = FormalPDE(
        name=name,
        equation="dphi_8/dt = D8 lap(phi_8) + alpha8 phi_8^2 + eta8 lap(phi_8^2)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return params.field_diffusion * lap + params.magnet_alpha8 * (field ** 2) + params.magnet_eta8 * _laplacian(field ** 2)


class AttractorOperator(BaseOperator):
    name = "The Attractor"
    pde = FormalPDE(
        name=name,
        equation="dphi_9/dt = D9 lap(phi_9) + rho9 phi_9^2 + eta9 lap(phi_9) - lambda9 lap^3(phi_9)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        return (
            (params.field_diffusion + params.attractor_eta9) * lap
            + params.attractor_rho9 * (field ** 2)
            - params.attractor_lambda9 * _triharmonic(field)
        )


class FinisherOperator(BaseOperator):
    name = "The Finisher"
    pde = FormalPDE(
        name=name,
        equation="dphi_10/dt = D10 lap(phi_10) + eps10 phi_10 - lambda10 lap^3(phi_10) + coupling(phi,S)",
    )

    def apply(self, state: HRMState, field: np.ndarray, params: HRMConfig) -> np.ndarray:
        lap = _laplacian(field)
        coupling_seed = 0.0
        if state.S.size > 1:
            coupling_seed = float(np.tanh(state.S[0] * state.S[1]))
        coupling = params.cross_coupling_gain * coupling_seed * _laplacian(field * np.mean(field))
        return (
            params.field_diffusion * lap
            + params.finisher_eps10 * field
            - params.finisher_lambda10 * _triharmonic(field)
            + coupling
        )


OPERATOR_CATALOG = [
    ArchitectOperator(),
    MessengerOperator(),
    TransformerOperator(),
    SmootherOperator(),
    RegulatorOperator(),
    FilterOperator(),
    FoundationOperator(),
    MagnetOperator(),
    AttractorOperator(),
    FinisherOperator(),
]


FORMAL_OPERATOR_EXECUTION_GRAPH = {
    "nodes": [op.name for op in OPERATOR_CATALOG],
    "edges": [
        ["The Architect", "The Messenger"],
        ["The Messenger", "The Transformer"],
        ["The Transformer", "The Smoother"],
        ["The Smoother", "The Regulator"],
        ["The Regulator", "The Filter"],
        ["The Filter", "The Foundation"],
        ["The Foundation", "The Magnet"],
        ["The Magnet", "The Attractor"],
        ["The Attractor", "The Finisher"],
        ["The Finisher", "The Architect"],
    ],
    "state_index_mapping": {
        "selector": "operational_state % 10",
        "description": "Operational state routes execution to one concrete operator class.",
    },
}


COMPOSITIONAL_PIPELINES = {
    "resonance_stack": ["The Architect", "The Messenger", "The Transformer"],
    "stability_stack": ["The Smoother", "The Regulator", "The Filter"],
    "phase_transition_stack": ["The Foundation", "The Magnet", "The Attractor", "The Finisher"],
}


def get_operator_catalog() -> list[dict]:
    return [{"name": op.name, "pde": op.pde.equation} for op in OPERATOR_CATALOG]


def get_operator_execution_graph() -> dict:
    return FORMAL_OPERATOR_EXECUTION_GRAPH


def get_compositional_pipelines() -> dict:
    return COMPOSITIONAL_PIPELINES


def _operator_by_name(name: str) -> BaseOperator:
    for op in OPERATOR_CATALOG:
        if op.name == name:
            return op
    raise KeyError(f"Unknown operator: {name}")


def run_operator_pipeline(state: HRMState, params: HRMConfig, pipeline_name: str) -> np.ndarray:
    names = COMPOSITIONAL_PIPELINES.get(pipeline_name)
    if not names:
        raise KeyError(f"Unknown pipeline: {pipeline_name}")

    field = state.phi
    combined = np.zeros_like(field)
    for name in names:
        op = _operator_by_name(name)
        combined += op.apply(state, field, params)

    drive = np.sin(state.theta) * state.guna[0] + np.cos(state.theta) * state.guna[min(1, state.guna.size - 1)]
    next_phi = field + params.dt * (combined / max(len(names), 1)) + drive * params.dt
    next_phi -= params.field_damping * field
    return next_phi


def get_active_operator_name(state: HRMState) -> str:
    idx = int(state.operational_state) % len(OPERATOR_CATALOG)
    return OPERATOR_CATALOG[idx].name


def step(state: HRMState, params: HRMConfig) -> np.ndarray:
    idx = int(state.operational_state) % len(OPERATOR_CATALOG)
    operator = OPERATOR_CATALOG[idx]
    dphi = operator.apply(state, state.phi, params)

    drive = np.sin(state.theta) * state.guna[0] + np.cos(state.theta) * state.guna[min(1, state.guna.size - 1)]
    next_phi = state.phi + params.dt * dphi + drive * params.dt
    next_phi -= params.field_damping * state.phi
    return next_phi
