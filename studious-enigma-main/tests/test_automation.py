"""Tests for the sandboxed automation subsystem."""
import os
import sys
import time
import json
import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from atlantean_core.automation.schemas import (
    AutomationAction,
    AutomationPlan,
    ALLOWED_ACTION_TYPES,
    FORBIDDEN_PATTERNS,
    ACTION_RISK,
)
from atlantean_core.automation.risk import classify_plan_risk, validate_plan_content
from atlantean_core.automation.approvals import create_token, verify_token, consume_token, TOKEN_TTL_SECONDS, compute_plan_hash
from atlantean_core.automation.planner import parse_plan_from_llm
from atlantean_core.automation.quarantine import quarantine_file, list_quarantine


# ── schemas ───────────────────────────────────────────────────────────────────

def test_allowed_action_types_non_empty():
    assert len(ALLOWED_ACTION_TYPES) >= 10


def test_forbidden_patterns_non_empty():
    assert len(FORBIDDEN_PATTERNS) > 0


def test_action_risk_levels_are_valid():
    for v in ACTION_RISK.values():
        assert v in (1, 2, 3)


# ── risk classification ───────────────────────────────────────────────────────

def _make_plan(actions):
    import time
    return AutomationPlan(
        plan_id='test-plan',
        summary='test',
        risk_level=1,
        actions=actions,
        session_id='sess-1',
        created_at=time.time(),
    )


def test_low_risk_read_only_action():
    action = AutomationAction(type='read_file', params={'path': '/home/user/notes.txt'})
    plan = _make_plan([action])
    level = classify_plan_risk([{'type': a.type} for a in plan.actions])
    assert level == 1


def test_high_risk_delete_action():
    action = AutomationAction(type='delete_file', params={'path': '/home/user/doc.txt'})
    plan = _make_plan([action])
    level = classify_plan_risk([{'type': a.type} for a in plan.actions])
    assert level in (2, 3)


def test_plan_risk_is_max_of_action_risks():
    low = AutomationAction(type='read_file', params={'path': '/tmp/a.txt'})
    high = AutomationAction(type='delete_file', params={'path': '/tmp/b.txt'})
    plan = _make_plan([low, high])
    level = classify_plan_risk([{'type': a.type} for a in plan.actions])
    assert level >= 2


def test_forbidden_content_rm_rf_rejected():
    action = AutomationAction(type='shell_run', params={'command': 'rm -rf /'})
    plan = _make_plan([action])
    # shell_run is not in ALLOWED_ACTION_TYPES — validate_plan_content catches it
    violations = validate_plan_content(plan.to_dict())
    # either forbidden content or unknown type
    assert len(violations) > 0


def test_forbidden_content_sudo_rejected():
    # Embed sudo into a read_file param to test forbidden pattern scanning
    action = AutomationAction(type='read_file', params={'path': 'sudo cat /etc/shadow'})
    plan = _make_plan([action])
    violations = validate_plan_content(plan.to_dict())
    assert any('sudo' in v.lower() or 'forbidden' in v.lower() or 'shadow' in v.lower() for v in violations)


def test_forbidden_content_safe_command_passes():
    action = AutomationAction(type='list_dir', params={'path': '/tmp'})
    plan = _make_plan([action])
    violations = validate_plan_content(plan.to_dict())
    assert violations == []


# ── approval tokens ───────────────────────────────────────────────────────────

def test_token_verify_valid():
    token = create_token('plan-123-hash')
    valid, _ = verify_token(token, 'plan-123-hash')
    assert valid is True


def test_token_verify_wrong_plan():
    token = create_token('hash-A')
    valid, _ = verify_token(token, 'hash-B')
    assert valid is False


def test_token_verify_tampered():
    token = create_token('plan-123-hash')
    tampered = token[:-4] + 'xxxx'
    valid, _ = verify_token(tampered, 'plan-123-hash')
    assert valid is False


def test_token_consume_prevents_replay():
    import atlantean_core.automation.approvals as _app
    token = create_token('plan-replay-hash')
    valid1, _ = verify_token(token, 'plan-replay-hash')
    assert valid1 is True
    # Already consumed by verify_token (adds to _used_tokens); replay must fail
    valid2, _ = verify_token(token, 'plan-replay-hash')
    assert valid2 is False


def test_token_ttl_expiry(monkeypatch):
    import atlantean_core.automation.approvals as _app
    monkeypatch.setattr(_app, 'TOKEN_TTL_SECONDS', 0)
    token = create_token('plan-ttl-hash')
    time.sleep(0.01)
    valid, reason = verify_token(token, 'plan-ttl-hash')
    assert valid is False
    assert 'expired' in reason


# ── planner ───────────────────────────────────────────────────────────────────

def test_parse_valid_plan_json():
    payload = json.dumps({
        'summary': 'List files',
        'actions': [
            {'type': 'list_dir', 'params': {'path': '/tmp'}}
        ]
    })
    plan = parse_plan_from_llm(payload, session_id='s1')
    assert plan.summary == 'List files'
    assert len(plan.actions) == 1
    assert plan.actions[0].type == 'list_dir'


def test_parse_disallowed_action_type():
    payload = json.dumps({
        'summary': 'Bad plan',
        'actions': [{'type': 'drop_database', 'params': {}}]
    })
    with pytest.raises(ValueError):
        parse_plan_from_llm(payload, session_id='s1')


def test_parse_empty_actions_rejected():
    payload = json.dumps({'summary': 'No actions', 'actions': []})
    with pytest.raises(ValueError):
        parse_plan_from_llm(payload, session_id='s1')


def test_plan_hash_deterministic():
    # Hash is computed from the plan dict; same plan object always hashes the same
    payload = json.dumps({
        'summary': 'Hash test',
        'actions': [{'type': 'read_file', 'params': {'path': '/tmp/x'}}]
    })
    plan = parse_plan_from_llm(payload, session_id='s1')
    d = plan.to_dict()
    assert compute_plan_hash(d) == compute_plan_hash(d)


def test_plan_hash_changes_on_mutation():
    payload = json.dumps({
        'summary': 'Mutation test',
        'actions': [{'type': 'read_file', 'params': {'path': '/tmp/a'}}]
    })
    plan = parse_plan_from_llm(payload, session_id='s1')
    original_hash = compute_plan_hash(plan.to_dict())
    plan.actions[0].params['path'] = '/etc/passwd'
    assert compute_plan_hash(plan.to_dict()) != original_hash


# ── approved-root path policy ─────────────────────────────────────────────────

import atlantean_core.automation.path_policy as _pp


def test_validate_path_within_root(tmp_path, monkeypatch):
    monkeypatch.setattr(_pp, '_state_file', str(tmp_path / 'roots.json'))
    monkeypatch.setattr(_pp, '_approved_roots', [])
    _pp.add_approved_root(str(tmp_path))
    _pp.validate_path(str(tmp_path / 'subdir' / 'file.txt'), allow_nonexistent=True)


def test_validate_path_outside_root_rejected(tmp_path, monkeypatch):
    allowed = tmp_path / 'allowed'
    allowed.mkdir()
    monkeypatch.setattr(_pp, '_state_file', str(tmp_path / 'roots.json'))
    monkeypatch.setattr(_pp, '_approved_roots', [])
    _pp.add_approved_root(str(allowed))
    with pytest.raises((ValueError, PermissionError)):
        _pp.validate_path('/etc/passwd')


def test_validate_path_traversal_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(_pp, '_state_file', str(tmp_path / 'roots.json'))
    monkeypatch.setattr(_pp, '_approved_roots', [])
    _pp.add_approved_root(str(tmp_path))
    with pytest.raises((ValueError, PermissionError)):
        _pp.validate_path(str(tmp_path) + '/../../../etc/shadow')


def test_add_remove_root_persists(tmp_path, monkeypatch):
    monkeypatch.setattr(_pp, '_state_file', str(tmp_path / 'roots.json'))
    monkeypatch.setattr(_pp, '_approved_roots', [])
    _pp.add_approved_root(str(tmp_path))
    assert str(os.path.realpath(tmp_path)) in _pp.get_approved_roots()
    _pp.remove_approved_root(str(tmp_path))
    assert str(os.path.realpath(tmp_path)) not in _pp.get_approved_roots()


# ── quarantine ────────────────────────────────────────────────────────────────

def test_quarantine_moves_file(tmp_path, monkeypatch):
    import atlantean_core.automation.quarantine as _q
    q_dir = tmp_path / 'quarantine'
    q_dir.mkdir()
    monkeypatch.setattr(_q, '_QUARANTINE_DIR', str(q_dir))
    monkeypatch.setattr(_q, '_MANIFEST', str(q_dir / 'manifest.json'))

    src = tmp_path / 'target.txt'
    src.write_text('sensitive data')
    q_path = quarantine_file(str(src), job_id='j1')
    assert not src.exists()
    assert Path(q_path).exists()


def test_quarantine_manifest_written(tmp_path, monkeypatch):
    import atlantean_core.automation.quarantine as _q
    q_dir = tmp_path / 'quarantine'
    q_dir.mkdir()
    monkeypatch.setattr(_q, '_QUARANTINE_DIR', str(q_dir))
    monkeypatch.setattr(_q, '_MANIFEST', str(q_dir / 'manifest.json'))

    src = tmp_path / 'target2.txt'
    src.write_text('data')
    quarantine_file(str(src), job_id='j2')
    manifest_path = q_dir / 'manifest.json'
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text())
    assert any(e['original_path'] == str(src) for e in manifest)


def test_list_quarantine_returns_items(tmp_path, monkeypatch):
    import atlantean_core.automation.quarantine as _q
    q_dir = tmp_path / 'quarantine'
    q_dir.mkdir()
    monkeypatch.setattr(_q, '_QUARANTINE_DIR', str(q_dir))
    monkeypatch.setattr(_q, '_MANIFEST', str(q_dir / 'manifest.json'))

    src = tmp_path / 'file_q.txt'
    src.write_text('x')
    quarantine_file(str(src), job_id='j3')
    items = list_quarantine()
    assert len(items) == 1
    assert items[0]['original_path'] == str(src)
