"""Typed action schemas for the automation planner."""
from dataclasses import dataclass, field
from typing import Any, Optional


ALLOWED_ACTION_TYPES = frozenset({
    'list_dir', 'search_files', 'read_file',
    'create_dir', 'copy_file', 'move_file', 'rename_file',
    'write_file', 'append_file', 'delete_file',
    'convert_csv_to_json', 'convert_json_to_csv',
    'extract_zip', 'create_zip',
    'run_python_script', 'run_tests', 'run_build',
    'git_status', 'git_diff',
    'format_file',
    'search_logs', 'summarize_file',
})

# Risk tier for each action type
ACTION_RISK = {
    # Level 1 — read-only
    'list_dir': 1, 'search_files': 1, 'read_file': 1,
    'git_status': 1, 'git_diff': 1, 'search_logs': 1,
    # Level 2 — reversible write
    'create_dir': 2, 'copy_file': 2, 'rename_file': 2, 'move_file': 2,
    'write_file': 2, 'append_file': 2,
    'convert_csv_to_json': 2, 'convert_json_to_csv': 2,
    'create_zip': 2, 'format_file': 2,
    # Level 3 — destructive/executable
    'delete_file': 3, 'extract_zip': 3,
    'run_python_script': 3, 'run_tests': 3, 'run_build': 3,
    'summarize_file': 2,  # uses local model; no filesystem write
}

RISK_LABELS = {1: 'read-only', 2: 'reversible-write', 3: 'destructive-or-executable'}

FORBIDDEN_PATTERNS = [
    r'sudo\b', r'\bsu\b', r'chmod\s+[0-7]*[04][0-7]',
    r'(curl|wget)\s+.*\|', r'eval\s*\(', r'exec\s*\(',
    r'base64\s+-d', r'python.*-c\s+["\']', r'--no-verify',
    r'/etc/shadow', r'/etc/passwd', r'\.ssh/',
    r'\.aws/credentials', r'crontab\s+-',
    r'>\s*/dev/', r'dd\s+if=', r'mkfs\.',
]


@dataclass
class AutomationAction:
    type: str
    params: dict[str, Any] = field(default_factory=dict)

    @property
    def risk_level(self) -> int:
        return ACTION_RISK.get(self.type, 3)

    @property
    def risk_label(self) -> str:
        return RISK_LABELS.get(self.risk_level, 'unknown')


@dataclass
class AutomationPlan:
    plan_id: str
    summary: str
    risk_level: int          # highest risk level across actions
    actions: list[AutomationAction]
    created_at: float
    session_id: str
    approved: bool = False
    approval_token: Optional[str] = None
    approved_at: Optional[float] = None
    plan_hash: str = ''

    def to_dict(self) -> dict:
        return {
            'plan_id': self.plan_id,
            'summary': self.summary,
            'risk_level': self.risk_level,
            'risk_label': RISK_LABELS.get(self.risk_level, 'unknown'),
            'actions': [{'type': a.type, 'params': a.params, 'risk_level': a.risk_level,
                         'risk_label': a.risk_label} for a in self.actions],
            'created_at': self.created_at,
            'session_id': self.session_id,
            'approved': self.approved,
            'plan_hash': self.plan_hash,
        }


@dataclass
class ExecutionResult:
    job_id: str
    plan_id: str
    action_type: str
    status: str          # success | failed | cancelled | timeout
    output: str
    error: Optional[str]
    started_at: float
    finished_at: float
    files_created: list[str] = field(default_factory=list)
    files_modified: list[str] = field(default_factory=list)
    files_quarantined: list[str] = field(default_factory=list)
