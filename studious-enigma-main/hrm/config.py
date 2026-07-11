from dataclasses import dataclass


@dataclass
class HRMConfig:
    dt: float = 0.05
    omega: float = 1.2
    field_diffusion: float = 0.08
    field_damping: float = 0.015
    state_gain: float = 0.12
    topology_threshold: float = 0.2
    energy_decay: float = 0.01
    coherence_gain: float = 0.2
    # Structural dimensions
    max_channels: int = 12
    max_domains: int = 22
    max_layers: int = 14

    # State representation
    state_dim: int = 24
    guna_components: int = 3

    # Routing/operation dimensions
    projection_modes: int = 4
    operational_states: int = 88

    # Operator coefficients (Architect..Finisher)
    architect_lambda2: float = 0.35
    architect_eta2: float = 0.04

    messenger_kappa3: float = 0.30

    transformer_mu4: float = 0.05
    transformer_nu4: float = 0.03

    smoother_omega5: float = 0.18
    smoother_eps: float = 1e-4

    regulator_xi6: float = 0.12
    regulator_zeta6: float = 0.02

    filter_sigma7: float = 0.08
    filter_tau7: float = 0.03

    foundation_tau8: float = 0.06

    magnet_alpha8: float = 0.07
    magnet_eta8: float = 0.02

    attractor_rho9: float = 0.06
    attractor_eta9: float = 0.02
    attractor_lambda9: float = 0.01

    finisher_eps10: float = 0.10
    finisher_lambda10: float = 0.02
    cross_coupling_gain: float = 0.04
