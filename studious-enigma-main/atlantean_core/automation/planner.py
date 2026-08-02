"""LLM-based plan generation from natural language requests."""
import json
import re
import uuid
import time
from typing import Optional
from .schemas import AutomationPlan, AutomationAction, ALLOWED_ACTION_TYPES, ACTION_RISK
from .risk import classify_plan_risk, validate_plan_content
from .approvals import compute_plan_hash


PLAN_SYSTEM_PROMPT = """You are a structured automation planner. Given a user request, produce ONLY a JSON plan.

ALLOWED action types: list_dir, search_files, read_file, create_dir, copy_file, move_file, rename_file, write_file, append_file, delete_file, convert_csv_to_json, convert_json_to_csv, extract_zip, create_zip, run_python_script, run_tests, run_build, git_status, git_diff, format_file, search_logs, summarize_file

FORBIDDEN: Any action not in the list above. No shell commands. No network access. No sudo. No credential access.

Respond ONLY with valid JSON. Schema:
{
  "summary": "Human-readable summary",
  "actions": [
    {"type": "action_type", "params": {"param": "value"}}
  ]
}

All paths must be absolute. Use only paths within approved roots that the user specifies.
"""


def parse_plan_from_llm(llm_response: str, session_id: str) -> AutomationPlan:
    """Parse and validate an LLM-generated plan JSON."""
    # Extract JSON from response
    raw = llm_response.strip()
    match = re.search(r'\{[\s\S]*\}', raw)
    if not match:
        raise ValueError('No JSON found in LLM response')
    plan_dict = json.loads(match.group())

    # Validate content
    violations = validate_plan_content(plan_dict)
    if violations:
        raise ValueError(f'Plan contains forbidden content: {violations[0]}')

    actions = []
    for a in plan_dict.get('actions', []):
        atype = a.get('type', '')
        if atype not in ALLOWED_ACTION_TYPES:
            raise ValueError(f'Unknown action type: {atype!r}')
        actions.append(AutomationAction(type=atype, params=a.get('params', {})))

    if not actions:
        raise ValueError('Plan has no actions')

    risk = classify_plan_risk([{'type': a.type} for a in actions])
    plan_id = str(uuid.uuid4())
    plan = AutomationPlan(
        plan_id=plan_id,
        summary=str(plan_dict.get('summary', 'Automation plan'))[:500],
        risk_level=risk,
        actions=actions,
        created_at=time.time(),
        session_id=session_id,
    )
    plan.plan_hash = compute_plan_hash(plan.to_dict())
    return plan


def make_plan_from_json(plan_json: dict, session_id: str) -> AutomationPlan:
    """Build a plan directly from a client-provided JSON dict."""
    violations = validate_plan_content(plan_json)
    if violations:
        raise ValueError(f'Plan contains forbidden content: {violations[0]}')

    actions = []
    for a in plan_json.get('actions', []):
        atype = a.get('type', '')
        if atype not in ALLOWED_ACTION_TYPES:
            raise ValueError(f'Unknown action type: {atype!r}')
        actions.append(AutomationAction(type=atype, params=a.get('params', {})))

    if not actions:
        raise ValueError('Plan has no actions')

    risk = classify_plan_risk([{'type': a.type} for a in actions])
    plan = AutomationPlan(
        plan_id=plan_json.get('plan_id') or str(uuid.uuid4()),
        summary=str(plan_json.get('summary', 'Plan'))[:500],
        risk_level=risk,
        actions=actions,
        created_at=time.time(),
        session_id=session_id,
    )
    plan.plan_hash = compute_plan_hash(plan.to_dict())
    return plan
