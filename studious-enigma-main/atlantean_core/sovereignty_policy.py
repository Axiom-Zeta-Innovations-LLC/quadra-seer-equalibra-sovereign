"""Sovereignty policy helpers for network and cloud-escalation controls."""

from typing import Dict, Tuple
from urllib.parse import urlparse


def is_loopback_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.hostname:
        return False

    host = parsed.hostname.lower()
    return host in {"127.0.0.1", "localhost", "::1"}


def evaluate_local_url_policy(url: str, allow_outbound_network: bool) -> Dict[str, object]:
    if allow_outbound_network:
        return {
            "allowed": True,
            "reason_code": "OUTBOUND_ALLOWED_BY_POLICY",
        }

    if is_loopback_url(url):
        return {
            "allowed": True,
            "reason_code": "OUTBOUND_LOOPBACK_ONLY",
        }

    return {
        "allowed": False,
        "reason_code": "OUTBOUND_BLOCKED_NON_LOOPBACK",
    }


def evaluate_cloud_escalation(
    allow_cloud_escalation: bool,
    require_cloud_escalation_consent: bool,
    explicit_consent: bool,
) -> Dict[str, object]:
    if not allow_cloud_escalation:
        return {
            "allowed": False,
            "reason_code": "CLOUD_ESCALATION_DISABLED_BY_POLICY",
        }

    if require_cloud_escalation_consent and not explicit_consent:
        return {
            "allowed": False,
            "reason_code": "CLOUD_ESCALATION_CONSENT_REQUIRED",
        }

    if require_cloud_escalation_consent and explicit_consent:
        return {
            "allowed": True,
            "reason_code": "CLOUD_ESCALATION_ALLOWED_WITH_CONSENT",
        }

    return {
        "allowed": True,
        "reason_code": "CLOUD_ESCALATION_ALLOWED_NO_CONSENT_REQUIRED",
    }
