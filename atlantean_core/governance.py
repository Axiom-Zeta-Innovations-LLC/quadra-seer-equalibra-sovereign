"""Governance controls for compute-bounded optional cognition layers."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, Iterable, Optional
import time


@dataclass
class GovernancePolicy:
    allow_symbolic_reasoning: bool = True
    window_seconds: int = 60
    max_symbolic_invocations_per_window: int = 32
    max_symbolic_compute_ms_per_window: float = 120.0
    max_single_symbolic_compute_ms: float = 12.0
    blocked_modules: set[str] = field(default_factory=set)
    # Runtime capability control plane.
    sandbox_mode: bool = True
    allow_self_modification: bool = False
    max_symbolic_depth: int = 2
    capability_permission_layers: Dict[str, int] = field(
        default_factory=lambda: {
            "read_memory": 1,
            "symbolic_infer": 1,
            "write_memory": 2,
            "invoke_tools": 2,
            "modify_policy": 3,
            "self_modify": 3,
        }
    )
    operator_authorization_hierarchy: Dict[str, int] = field(
        default_factory=lambda: {
            "symbolic_reasoning": 2,
            "governance_admin": 3,
            "self_reflector": 3,
        }
    )
    module_capability_scopes: Dict[str, set[str]] = field(
        default_factory=lambda: {
            "symbolic_reasoning": {"read_memory", "symbolic_infer", "write_memory"},
        }
    )
    isolated_modules: set[str] = field(default_factory=lambda: {"symbolic_reasoning"})
    # Allowed directed calls from caller->target when both sides are provided.
    allowed_module_calls: set[tuple[str, str]] = field(default_factory=set)


@dataclass
class GovernanceDecision:
    allowed: bool
    reason: str
    estimated_cost_ms: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "allowed": bool(self.allowed),
            "reason": self.reason,
            "estimated_cost_ms": float(self.estimated_cost_ms),
        }


class GovernanceController:
    """Tracks and enforces compute/policy limits across optional modules."""

    def __init__(self, policy: GovernancePolicy | None = None):
        self.policy = policy or GovernancePolicy()
        self._invocations: Dict[str, Deque[float]] = {}
        self._compute_ms: Dict[str, Deque[tuple[float, float]]] = {}

    def _prune(self, module: str, now: float) -> None:
        window_start = now - float(self.policy.window_seconds)

        inv = self._invocations.setdefault(module, deque())
        while inv and inv[0] < window_start:
            inv.popleft()

        costs = self._compute_ms.setdefault(module, deque())
        while costs and costs[0][0] < window_start:
            costs.popleft()

    @staticmethod
    def _parse_tags(tags: Optional[Iterable[str]]) -> Dict[str, Any]:
        parsed: Dict[str, Any] = {
            "caps": set(),
            "operator": None,
            "caller": None,
            "target": None,
            "depth": 1,
            "risk": "normal",
        }
        for raw in tags or []:
            tag = str(raw).strip()
            if not tag:
                continue
            if tag.startswith("cap:"):
                parsed["caps"].add(tag[4:])
            elif tag.startswith("op:"):
                parsed["operator"] = tag[3:]
            elif tag.startswith("caller:"):
                parsed["caller"] = tag[7:]
            elif tag.startswith("target:"):
                parsed["target"] = tag[7:]
            elif tag.startswith("depth:"):
                try:
                    parsed["depth"] = max(1, int(tag[6:]))
                except ValueError:
                    parsed["depth"] = 1
            elif tag.startswith("risk:"):
                parsed["risk"] = tag[5:]
        return parsed

    def _authorize_runtime(self, module: str, tags: Optional[Iterable[str]]) -> GovernanceDecision | None:
        parsed = self._parse_tags(tags)
        caps: set[str] = parsed["caps"]
        operator = parsed["operator"]
        caller = parsed["caller"]
        target = parsed["target"]
        depth = int(parsed["depth"])
        risk = parsed["risk"]

        if depth > int(self.policy.max_symbolic_depth):
            return GovernanceDecision(False, "cognitive-throttle-depth-limit", 0.0)

        if risk == "high":
            return GovernanceDecision(False, "cognitive-throttle-risk-limit", 0.0)

        if ("self_modify" in caps or operator == "self_reflector") and not self.policy.allow_self_modification:
            return GovernanceDecision(False, "self-modification-blocked", 0.0)

        if self.policy.sandbox_mode:
            if caller and target and caller != target and (caller, target) not in self.policy.allowed_module_calls:
                return GovernanceDecision(False, "module-isolation-violation", 0.0)
            if module in self.policy.isolated_modules and caller and caller != module:
                if (caller, module) not in self.policy.allowed_module_calls:
                    return GovernanceDecision(False, "module-isolation-violation", 0.0)

        if caps:
            allowed_caps = self.policy.module_capability_scopes.get(module, set())
            if any(cap not in allowed_caps for cap in caps):
                return GovernanceDecision(False, "capability-scope-violation", 0.0)

        if operator:
            op_level = int(self.policy.operator_authorization_hierarchy.get(operator, 99))
            # Determine strictest requested permission layer among capabilities.
            req_layer = 1
            for cap in caps:
                req_layer = max(req_layer, int(self.policy.capability_permission_layers.get(cap, 99)))
            if op_level < req_layer:
                return GovernanceDecision(False, "operator-authorization-insufficient", 0.0)

        return None

    def authorize(self, module: str, estimated_cost_ms: float, tags: Optional[Iterable[str]] = None) -> GovernanceDecision:
        now = time.time()
        self._prune(module, now)

        if module in self.policy.blocked_modules:
            return GovernanceDecision(False, f"module-blocked:{module}", estimated_cost_ms)

        if module == "symbolic_reasoning" and not self.policy.allow_symbolic_reasoning:
            return GovernanceDecision(False, "symbolic-disabled-by-policy", estimated_cost_ms)

        runtime_decision = self._authorize_runtime(module, tags)
        if runtime_decision is not None:
            return GovernanceDecision(False, runtime_decision.reason, estimated_cost_ms)

        if estimated_cost_ms > self.policy.max_single_symbolic_compute_ms:
            return GovernanceDecision(False, "single-call-compute-limit", estimated_cost_ms)

        inv = self._invocations.setdefault(module, deque())
        if len(inv) >= self.policy.max_symbolic_invocations_per_window:
            return GovernanceDecision(False, "invocation-rate-limit", estimated_cost_ms)

        costs = self._compute_ms.setdefault(module, deque())
        used_ms = sum(v for _, v in costs)
        if used_ms + estimated_cost_ms > self.policy.max_symbolic_compute_ms_per_window:
            return GovernanceDecision(False, "window-compute-budget-exceeded", estimated_cost_ms)

        return GovernanceDecision(True, "allowed", estimated_cost_ms)

    def record_execution(self, module: str, compute_ms: float) -> None:
        now = time.time()
        self._prune(module, now)
        self._invocations.setdefault(module, deque()).append(now)
        self._compute_ms.setdefault(module, deque()).append((now, float(compute_ms)))

    def snapshot(self) -> Dict[str, Any]:
        now = time.time()
        modules = set(self._invocations.keys()) | set(self._compute_ms.keys())
        out: Dict[str, Any] = {}
        for module in modules:
            self._prune(module, now)
            inv = self._invocations.get(module, deque())
            costs = self._compute_ms.get(module, deque())
            out[module] = {
                "invocations_in_window": len(inv),
                "compute_ms_in_window": round(sum(v for _, v in costs), 3),
                "window_seconds": self.policy.window_seconds,
            }
        return out
