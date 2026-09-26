"""Audit logging for automation events, integrated with the Atlantean ledger."""
import json
import os
import time
import hashlib
import threading

_AUDIT_LOG = os.path.abspath('./vault_data/automation_audit.jsonl')
_lock = threading.Lock()


def _append(event: dict) -> None:
    os.makedirs(os.path.dirname(_AUDIT_LOG), exist_ok=True)
    with _lock:
        with open(_AUDIT_LOG, 'a', encoding='utf-8') as f:
            f.write(json.dumps(event) + '\n')


def _event(event_type: str, **kwargs) -> dict:
    return {
        'event_type': event_type,
        'timestamp': time.time(),
        'event_id': hashlib.sha256(f'{event_type}:{time.time_ns()}'.encode()).hexdigest()[:16],
        **kwargs,
    }


def log_plan_created(plan_id: str, plan_hash: str, summary: str, risk_level: int, session_id: str):
    _append(_event('plan_created', plan_id=plan_id, plan_hash=plan_hash,
                   summary=summary, risk_level=risk_level, session_id=session_id))


def log_plan_approved(plan_id: str, plan_hash: str, session_id: str):
    _append(_event('plan_approved', plan_id=plan_id, plan_hash=plan_hash, session_id=session_id))


def log_plan_rejected(plan_id: str, plan_hash: str, session_id: str, reason: str = ''):
    _append(_event('plan_rejected', plan_id=plan_id, plan_hash=plan_hash,
                   session_id=session_id, reason=reason))


def log_execution_started(job_id: str, plan_id: str, action_type: str, session_id: str):
    _append(_event('execution_started', job_id=job_id, plan_id=plan_id,
                   action_type=action_type, session_id=session_id))


def log_execution_completed(job_id: str, plan_id: str, action_type: str,
                             status: str, result_hash: str, session_id: str):
    _append(_event('execution_completed', job_id=job_id, plan_id=plan_id,
                   action_type=action_type, status=status, result_hash=result_hash,
                   session_id=session_id))


def log_file_quarantined(original_path: str, quarantine_path: str, job_id: str):
    # Store only path hash, not content
    path_hash = hashlib.sha256(original_path.encode()).hexdigest()[:16]
    _append(_event('file_quarantined', path_hash=path_hash,
                   quarantine_path=quarantine_path, job_id=job_id))


def log_quarantine_restored(quarantine_path: str, original_path: str):
    _append(_event('quarantine_restored', quarantine_path=quarantine_path,
                   original_path=original_path))


def get_recent_events(limit: int = 50) -> list[dict]:
    if not os.path.exists(_AUDIT_LOG):
        return []
    events = []
    with _lock:
        with open(_AUDIT_LOG, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except Exception:
                        pass
    return events[-limit:]
