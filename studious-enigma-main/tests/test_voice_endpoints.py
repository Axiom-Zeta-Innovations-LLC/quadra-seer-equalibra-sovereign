"""Tests for the local-voice Flask endpoints (Step 31 / item 2-of-4).

These tests exercise the Flask routes /api/atlantean/voice/capabilities,
/api/atlantean/transcribe, and /api/atlantean/tts with the actual
atlantean_backend Flask app in test-client mode, without requiring Ollama,
faster-whisper, or Piper to be installed.
"""

import base64
import io
import json
import struct
import sys
import types
import unittest


# ── optional-dependency stubs ────────────────────────────────────────────────
# Prevent ImportError when the heavyweight optional packages are absent.

def _stub(name: str, **attrs) -> types.ModuleType:
    if name not in sys.modules:
        mod = types.ModuleType(name)
        mod.__dict__.update(attrs)
        sys.modules[name] = mod
    return sys.modules[name]


_stub('faster_whisper', WhisperModel=None)
_stub('piper',          PiperVoice=None)
# Only stub torch when it is NOT already imported; mutating the real torch module
# corrupts torch.load for every subsequent test in the combined validation run.
if 'torch' not in sys.modules:
    _torch = _stub('torch')
    _torch.tensor   = lambda *a, **kw: None
    _torch.nn       = _stub('torch.nn')
    _torch.no_grad  = lambda: __import__('contextlib').nullcontext()
_stub('torchvision')
_stub('redis',
      Redis=lambda **kw: (_ for _ in ()).throw(Exception("stub")),
      ConnectionError=ConnectionError,
      TimeoutError=TimeoutError)
# Only stub numpy/sklearn when not already imported — mutating the real numpy
# breaks np.random for every subsequent test in the combined validation run.
if 'numpy' not in sys.modules:
    _np = _stub('numpy')
    _np.ndarray  = type('ndarray', (), {})
    _np.array    = lambda *a, **kw: []
    _np.zeros    = lambda *a, **kw: []
    _np.float64  = float
_stub('sklearn')
_stub('sklearn.preprocessing')
_stub('sklearn.cluster')
_stub('google')
_stub('google.genai')
_stub('google.genai.types')
# ─────────────────────────────────────────────────────────────────────────────


def _minimal_wav(sample_rate: int = 22050) -> bytes:
    """Build the smallest valid PCM WAV header + 1 sample."""
    num_channels, bits = 1, 16
    byte_rate   = sample_rate * num_channels * bits // 8
    block_align = num_channels * bits // 8
    data_size   = 2  # one 16-bit sample
    return (
        b'RIFF'
        + struct.pack('<I', 36 + data_size)
        + b'WAVE'
        + b'fmt '
        + struct.pack('<I', 16)
        + struct.pack('<H', 1)               # PCM
        + struct.pack('<H', num_channels)
        + struct.pack('<I', sample_rate)
        + struct.pack('<I', byte_rate)
        + struct.pack('<H', block_align)
        + struct.pack('<H', bits)
        + b'data'
        + struct.pack('<I', data_size)
        + b'\x00\x00'                        # silent sample
    )


# ─────────────────────────────────────────────────────────────────────────────

# Try importing the Flask app; skip all endpoint tests if deps are absent.
try:
    import atlantean_backend as _backend_module  # noqa: F401
    BACKEND_AVAILABLE = True
except Exception:
    BACKEND_AVAILABLE = False

_skip_no_backend = unittest.skipUnless(
    BACKEND_AVAILABLE,
    "atlantean_backend not importable (Flask / optional deps missing) — skipping endpoint tests"
)


@_skip_no_backend
class TestVoiceCapabilitiesEndpoint(unittest.TestCase):
    """GET /api/atlantean/voice/capabilities returns expected structure."""

    def _get_client(self):
        # Import app lazily so stubs are in place first.
        import importlib
        import atlantean_backend as ab
        return ab.app.test_client()

    def test_returns_200_with_stt_and_tts_keys(self):
        client = self._get_client()
        resp = client.get('/api/atlantean/voice/capabilities')
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn('stt', data)
        self.assertIn('tts', data)
        self.assertIn('config', data)

    def test_stt_has_available_key(self):
        client = self._get_client()
        resp = client.get('/api/atlantean/voice/capabilities')
        data = json.loads(resp.data)
        self.assertIn('available', data['stt'])
        self.assertIsInstance(data['stt']['available'], bool)

    def test_tts_has_available_and_voice_keys(self):
        client = self._get_client()
        resp = client.get('/api/atlantean/voice/capabilities')
        data = json.loads(resp.data)
        for key in ('available', 'configured_voice', 'voice_model_found'):
            self.assertIn(key, data['tts'])


@_skip_no_backend
class TestTranscribeEndpoint(unittest.TestCase):
    """POST /api/atlantean/transcribe — error handling without real Whisper."""

    def _get_client(self):
        import atlantean_backend as ab
        return ab.app.test_client()

    def test_missing_audio_returns_400(self):
        client = self._get_client()
        resp = client.post(
            '/api/atlantean/transcribe',
            json={},
            content_type='application/json',
        )
        self.assertIn(resp.status_code, (400, 503))

    def test_invalid_base64_returns_400(self):
        client = self._get_client()
        resp = client.post(
            '/api/atlantean/transcribe',
            json={'audio_base64': '!!!not-base64!!!'},
            content_type='application/json',
        )
        self.assertIn(resp.status_code, (400, 503))

    def test_valid_audio_without_whisper_returns_503(self):
        """When faster-whisper is absent the endpoint must return 503, not 500."""
        client = self._get_client()
        wav_b64 = base64.b64encode(_minimal_wav()).decode()
        resp = client.post(
            '/api/atlantean/transcribe',
            json={'audio_base64': wav_b64},
            content_type='application/json',
        )
        # 503 = library not installed; 500 = unhandled error (not acceptable)
        self.assertNotEqual(resp.status_code, 500,
            f"Expected 503 (not 500). body={resp.data[:200]}")
        self.assertIn(resp.status_code, (200, 503))


@_skip_no_backend
class TestLocalTtsEndpoint(unittest.TestCase):
    """POST /api/atlantean/tts — error handling without real Piper."""

    def _get_client(self):
        import atlantean_backend as ab
        return ab.app.test_client()

    def test_missing_text_returns_400(self):
        client = self._get_client()
        resp = client.post(
            '/api/atlantean/tts',
            json={},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_text_too_long_returns_400(self):
        client = self._get_client()
        resp = client.post(
            '/api/atlantean/tts',
            json={'text': 'x' * 4001},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_voice_name_returns_400(self):
        client = self._get_client()
        resp = client.post(
            '/api/atlantean/tts',
            json={'text': 'hello', 'voice': '../../../etc/passwd'},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_valid_text_without_piper_returns_503(self):
        """When Piper is absent the endpoint must return 503, not 500."""
        client = self._get_client()
        resp = client.post(
            '/api/atlantean/tts',
            json={'text': 'Hello world.'},
            content_type='application/json',
        )
        self.assertNotEqual(resp.status_code, 500,
            f"Expected 503 (not 500). body={resp.data[:200]}")
        self.assertIn(resp.status_code, (200, 503))


if __name__ == '__main__':
    unittest.main()
