"""Tests for the voice sovereignty gate in the backend."""
import os
import sys
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ── voice/capabilities endpoint sovereignty flags ─────────────────────────────

def _make_app(allow_browser: str = "0", require_local: str = "1"):
    env_overrides = {
        "ATLANTEAN_ALLOW_BROWSER_SPEECH_FALLBACK": allow_browser,
        "ATLANTEAN_REQUIRE_LOCAL_STT": require_local,
        "ATLANTEAN_API_TOKEN": "test-token",
        "REDIS_URL": "",
    }
    with patch.dict(os.environ, env_overrides, clear=False):
        # Re-import so env vars are picked up by module-level reads
        if "atlantean_backend" in sys.modules:
            del sys.modules["atlantean_backend"]
        import atlantean_backend as backend
        app = backend.app
        app.config["TESTING"] = True
        return app


@pytest.fixture()
def sovereign_client():
    """Client with browser fallback disabled (sovereign default)."""
    app = _make_app(allow_browser="0", require_local="1")
    with app.test_client() as c:
        yield c


@pytest.fixture()
def permissive_client():
    """Client with browser fallback explicitly allowed."""
    app = _make_app(allow_browser="1", require_local="0")
    with app.test_client() as c:
        yield c


AUTH = {"Authorization": "Bearer test-token"}


def test_sovereign_mode_blocks_browser_fallback(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    assert resp.status_code == 200
    data = json.loads(resp.data)
    sovereignty = data.get("sovereignty", {})
    assert sovereignty.get("allow_browser_speech_fallback") is False


def test_sovereign_mode_requires_local_stt(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    data = json.loads(resp.data)
    sovereignty = data.get("sovereignty", {})
    assert sovereignty.get("require_local_stt") is True


def test_permissive_mode_allows_browser_fallback(permissive_client):
    resp = permissive_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    assert resp.status_code == 200
    data = json.loads(resp.data)
    sovereignty = data.get("sovereignty", {})
    assert sovereignty.get("allow_browser_speech_fallback") is True


def test_permissive_mode_does_not_require_local_stt(permissive_client):
    resp = permissive_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    data = json.loads(resp.data)
    sovereignty = data.get("sovereignty", {})
    assert sovereignty.get("require_local_stt") is False


# ── privacy/status endpoint ───────────────────────────────────────────────────

def test_privacy_status_offline_mode(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/privacy/status", headers=AUTH)
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert "network_mode" in data
    assert data["allow_browser_speech_fallback"] is False
    assert data["require_local_stt"] is True


def test_privacy_status_external_mode(permissive_client):
    resp = permissive_client.get("/api/atlantean/privacy/status", headers=AUTH)
    data = json.loads(resp.data)
    assert data["allow_browser_speech_fallback"] is True


def test_privacy_status_unauthenticated_rejected(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/privacy/status")
    assert resp.status_code in (401, 403)


# ── transcribe endpoint requires local STT ────────────────────────────────────

def test_transcribe_no_audio_400(sovereign_client):
    resp = sovereign_client.post(
        "/api/atlantean/transcribe",
        headers={**AUTH, "Content-Type": "application/json"},
        data=json.dumps({}),
    )
    # Missing audio_base64 → 400
    assert resp.status_code == 400


def test_transcribe_invalid_base64_400(sovereign_client):
    resp = sovereign_client.post(
        "/api/atlantean/transcribe",
        headers={**AUTH, "Content-Type": "application/json"},
        data=json.dumps({"audio_base64": "!!!not-valid-b64!!!"}),
    )
    assert resp.status_code in (400, 422, 500)


# ── sovereignty flag propagation to useSpeechToText hook contract ─────────────
# These tests verify the *contract* the hook relies on, not the hook itself
# (which is TypeScript and tested via the build type-check).

def test_capabilities_response_has_sovereignty_key(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    data = json.loads(resp.data)
    assert "sovereignty" in data, "Hook relies on data.sovereignty being present"


def test_capabilities_sovereignty_has_required_fields(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    data = json.loads(resp.data)
    s = data["sovereignty"]
    assert "allow_browser_speech_fallback" in s
    assert "require_local_stt" in s


def test_capabilities_stt_key_present(sovereign_client):
    resp = sovereign_client.get("/api/atlantean/voice/capabilities", headers=AUTH)
    data = json.loads(resp.data)
    assert "stt" in data
    assert "available" in data["stt"]
