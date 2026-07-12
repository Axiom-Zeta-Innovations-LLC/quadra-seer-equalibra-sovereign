#!/usr/bin/env python3
"""Vault acceptance test + latency benchmark suite.

Probes a running Atlantean backend and validates every contract that must hold
for a production Vault deployment.  Each test class covers one acceptance area.

Usage::

    python benchmarks/vault_acceptance.py
    python benchmarks/vault_acceptance.py --backend-url http://127.0.0.1:5001
    python benchmarks/vault_acceptance.py --token <api-token>
    python benchmarks/vault_acceptance.py --json   # machine-readable report

Exit code:
    0  all tests passed
    1  one or more tests failed
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import unittest
import urllib.request
import urllib.error
from typing import Any, Dict

_BASE_URL: str = os.getenv("ATLANTEAN_BACKEND_URL", "http://127.0.0.1:5001")
_TOKEN: str = os.getenv("ATLANTEAN_API_TOKEN", "")
_TIMEOUT: int = 10
_LATENCY_SAMPLES: int = 5

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if _TOKEN:
        h["Authorization"] = f"Bearer {_TOKEN}"
    return h


def _get(path: str, expect_200: bool = True) -> Dict[str, Any]:
    url = f"{_BASE_URL}{path}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = json.loads(resp.read().decode())
            return {"status": resp.status, "body": body}
    except urllib.error.HTTPError as e:
        body = {}
        try:
            body = json.loads(e.read().decode())
        except Exception:
            pass
        return {"status": e.code, "body": body, "error": str(e)}
    except Exception as e:
        return {"status": 0, "body": {}, "error": str(e)}


def _post(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{_BASE_URL}{path}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = json.loads(resp.read().decode())
            return {"status": resp.status, "body": body}
    except urllib.error.HTTPError as e:
        body = {}
        try:
            body = json.loads(e.read().decode())
        except Exception:
            pass
        return {"status": e.code, "body": body, "error": str(e)}
    except Exception as e:
        return {"status": 0, "body": {}, "error": str(e)}


# ---------------------------------------------------------------------------
# Test classes
# ---------------------------------------------------------------------------

class TestBackendReachability(unittest.TestCase):
    """The backend must be reachable and return healthy status."""

    def test_health_shallow(self):
        r = _get("/health", expect_200=True)
        self.assertEqual(r["status"], 200, f"health check failed: {r}")
        self.assertEqual(r["body"].get("status"), "healthy")

    def test_health_deep(self):
        r = _get("/health/deep")
        self.assertEqual(r["status"], 200, f"deep health failed: {r}")
        self.assertIn("checks", r["body"])

    def test_health_deep_no_auth_required(self):
        """Deep health must not require a token (monitoring probes)."""
        # Save and remove token temporarily
        original = _headers().get("Authorization")
        url = f"{_BASE_URL}/health/deep"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                self.assertEqual(resp.status, 200)
        except urllib.error.HTTPError as e:
            self.assertNotEqual(e.code, 401, "health/deep must not require auth")


class TestAuthEnforcement(unittest.TestCase):
    """When a token is configured the backend must reject un-authenticated calls."""

    def test_unauthenticated_call_rejected_when_token_set(self):
        if not _TOKEN:
            self.skipTest("ATLANTEAN_API_TOKEN not set — auth enforcement not active")
        url = f"{_BASE_URL}/api/atlantean/status"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT):
                self.fail("Expected 401 but got 200")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 401)

    def test_authenticated_call_succeeds(self):
        r = _get("/api/atlantean/status")
        self.assertIn(r["status"], (200, 401), f"Unexpected status: {r}")
        if _TOKEN:
            self.assertEqual(r["status"], 200)


class TestSovereigntyPolicy(unittest.TestCase):
    """The backend must enforce local-first sovereignty defaults."""

    def test_routing_settings_present(self):
        r = _get("/api/atlantean/routing/settings")
        self.assertEqual(r["status"], 200, f"{r}")
        settings = r["body"]
        self.assertIn("provider", settings)

    def test_cloud_escalation_disabled_by_default(self):
        r = _get("/api/atlantean/routing/settings")
        if r["status"] != 200:
            self.skipTest("routing settings unavailable")
        provider = r["body"].get("provider", {})
        # Vault default: cloud escalation OFF
        cloud_enabled = provider.get("allow_cloud_escalation", True)
        self.assertFalse(cloud_enabled, "ALLOW_CLOUD_ESCALATION should be 0 on Vault")

    def test_outbound_network_disabled_by_default(self):
        r = _get("/api/atlantean/routing/settings")
        if r["status"] != 200:
            self.skipTest("routing settings unavailable")
        provider = r["body"].get("provider", {})
        outbound = provider.get("allow_outbound_network", True)
        self.assertFalse(outbound, "ALLOW_OUTBOUND_NETWORK should be 0 on Vault")


class TestVoicePipeline(unittest.TestCase):
    """Voice capabilities endpoint must return correct structure."""

    def test_voice_capabilities_structure(self):
        r = _get("/api/atlantean/voice/capabilities")
        self.assertEqual(r["status"], 200, f"{r}")
        body = r["body"]
        self.assertIn("stt", body)
        self.assertIn("tts", body)
        self.assertIn("config", body)
        self.assertIn("available", body["stt"])
        self.assertIn("available", body["tts"])

    def test_transcribe_rejects_empty(self):
        r = _post("/api/atlantean/transcribe", {})
        self.assertIn(r["status"], (400, 503), f"Expected 400/503, got {r}")

    def test_tts_rejects_empty_text(self):
        r = _post("/api/atlantean/tts", {"text": ""})
        self.assertEqual(r["status"], 400, f"{r}")

    def test_tts_rejects_long_text(self):
        r = _post("/api/atlantean/tts", {"text": "x" * 4001})
        self.assertEqual(r["status"], 400, f"{r}")

    def test_tts_rejects_path_traversal_voice(self):
        r = _post("/api/atlantean/tts", {"text": "hello", "voice": "../../etc/passwd"})
        self.assertEqual(r["status"], 400, f"{r}")


class TestMemoryIntegrity(unittest.TestCase):
    """Memory encryption flag and ledger integrity must be active."""

    def test_health_deep_reports_encryption(self):
        r = _get("/health/deep")
        if r["status"] != 200:
            self.skipTest("deep health unavailable")
        checks = r["body"].get("checks", {})
        enc = checks.get("encryption", "unknown")
        self.assertEqual(enc, "enabled",
            "ATLANTEAN_ENCRYPTION_ENABLED should be 1 on Vault")

    def test_intelligence_status_reachable(self):
        r = _get("/api/atlantean/status")
        self.assertIn(r["status"], (200, 401))
        if r["status"] == 200:
            self.assertIn("version", r["body"])


class TestLatency(unittest.TestCase):
    """Shallow health must respond in under 500 ms on any hardware."""

    def test_health_latency(self):
        latencies = []
        for _ in range(_LATENCY_SAMPLES):
            t0 = time.perf_counter()
            _get("/health")
            latencies.append((time.perf_counter() - t0) * 1000)
        avg_ms = sum(latencies) / len(latencies)
        p95_ms = sorted(latencies)[int(len(latencies) * 0.95)]
        print(f"\n  [latency] /health  avg={avg_ms:.1f}ms  p95={p95_ms:.1f}ms")
        self.assertLess(avg_ms, 500,
            f"Average health latency {avg_ms:.1f}ms exceeds 500ms threshold")


# ---------------------------------------------------------------------------
# CLI runner
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Vault acceptance tests")
    p.add_argument("--backend-url", default=_BASE_URL)
    p.add_argument("--token", default=_TOKEN)
    p.add_argument("--json", action="store_true", help="JSON output")
    p.add_argument("--latency-samples", type=int, default=_LATENCY_SAMPLES)
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    _BASE_URL = args.backend_url
    _TOKEN = args.token
    _LATENCY_SAMPLES = args.latency_samples

    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
