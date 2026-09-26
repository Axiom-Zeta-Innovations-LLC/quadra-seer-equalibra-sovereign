"""Risk classification and forbidden-pattern detection."""
import re
import json
from .schemas import AutomationPlan, FORBIDDEN_PATTERNS, ACTION_RISK


def classify_plan_risk(actions: list[dict]) -> int:
    """Return the highest risk level (1-3) across all actions."""
    max_risk = 1
    for a in actions:
        level = ACTION_RISK.get(a.get('type', ''), 3)
        max_risk = max(max_risk, level)
    return max_risk


def check_forbidden_content(value: str) -> list[str]:
    """Return a list of matched forbidden pattern descriptions."""
    hits = []
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, value, re.IGNORECASE):
            hits.append(pattern)
    return hits


def validate_plan_content(plan_dict: dict) -> list[str]:
    """Return a list of security violations found in the plan."""
    violations: list[str] = []
    raw = json.dumps(plan_dict)
    for pattern in FORBIDDEN_PATTERNS:
        if re.search(pattern, raw, re.IGNORECASE):
            violations.append(f'Forbidden pattern detected: {pattern}')
    actions = plan_dict.get('actions', [])
    for i, action in enumerate(actions):
        atype = action.get('type', '')
        if atype not in ACTION_RISK:
            violations.append(f'Action [{i}]: unknown type {atype!r}')
        params = action.get('params', {})
        for k, v in params.items():
            if isinstance(v, str):
                hits = check_forbidden_content(v)
                if hits:
                    violations.append(f'Action [{i}] param {k!r}: forbidden content')
    return violations
