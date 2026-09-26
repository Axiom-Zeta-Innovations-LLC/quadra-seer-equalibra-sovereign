"""Unit tests for atlantean_core.local_voice (Step 31).

These tests validate the availability-check helpers and basic wiring of the
LocalWhisperTranscriber and LocalPiperTts adapters without requiring the
actual optional dependencies (faster-whisper, piper-tts) to be installed.
"""

import sys
import types
import unittest


# ---------------------------------------------------------------------------
# Helper: install a minimal stub for a missing optional dependency so that
# importing local_voice doesn't raise ImportError during the test run.
# ---------------------------------------------------------------------------

def _stub_module(name: str, **attrs) -> types.ModuleType:
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod
    return mod


# Stub faster_whisper if not installed.
if 'faster_whisper' not in sys.modules:
    _stub_module('faster_whisper', WhisperModel=None)

# Stub piper if not installed.
if 'piper' not in sys.modules:
    _stub_module('piper', PiperVoice=None)


from atlantean_core.local_voice import (  # noqa: E402  (import after stub setup)
    LocalWhisperTranscriber,
    LocalPiperTts,
    _wav_sample_rate,
    check_whisper_available,
    check_piper_available,
)


class TestWavSampleRate(unittest.TestCase):
    """_wav_sample_rate should extract sample rate from a minimal WAV header."""

    def _make_wav_header(self, sample_rate: int) -> bytes:
        """Build a bare 44-byte WAV header with the given sample rate."""
        import struct
        num_channels = 1
        bits_per_sample = 16
        byte_rate = sample_rate * num_channels * bits_per_sample // 8
        block_align = num_channels * bits_per_sample // 8
        data_size = 0
        header = (
            b'RIFF'
            + struct.pack('<I', 36 + data_size)  # file size - 8
            + b'WAVE'
            + b'fmt '
            + struct.pack('<I', 16)              # subchunk1 size
            + struct.pack('<H', 1)               # PCM format
            + struct.pack('<H', num_channels)
            + struct.pack('<I', sample_rate)
            + struct.pack('<I', byte_rate)
            + struct.pack('<H', block_align)
            + struct.pack('<H', bits_per_sample)
            + b'data'
            + struct.pack('<I', data_size)
        )
        return header

    def test_extracts_22050(self):
        wav = self._make_wav_header(22050)
        self.assertEqual(_wav_sample_rate(wav), 22050)

    def test_extracts_24000(self):
        wav = self._make_wav_header(24000)
        self.assertEqual(_wav_sample_rate(wav), 24000)

    def test_extracts_44100(self):
        wav = self._make_wav_header(44100)
        self.assertEqual(_wav_sample_rate(wav), 44100)

    def test_fallback_on_empty(self):
        self.assertEqual(_wav_sample_rate(b''), 22050)

    def test_fallback_on_non_wav(self):
        self.assertEqual(_wav_sample_rate(b'NOTAWAVE' + b'\x00' * 40), 22050)


class TestAvailabilityChecks(unittest.TestCase):
    """check_whisper_available / check_piper_available return structured dicts."""

    def test_whisper_check_returns_dict_with_available_key(self):
        result = check_whisper_available()
        self.assertIn('available', result)
        self.assertIsInstance(result['available'], bool)

    def test_piper_check_returns_dict_with_required_keys(self):
        result = check_piper_available(voice_dir='./voices', voice='en_US-lessac-medium')
        for key in ('available', 'package_installed', 'cli_available', 'voice_model_found'):
            self.assertIn(key, result)
        self.assertIsInstance(result['available'], bool)

    def test_piper_check_reports_missing_voice_model(self):
        result = check_piper_available(
            voice_dir='/nonexistent_dir_that_cannot_exist',
            voice='en_US-lessac-medium',
        )
        self.assertFalse(result['voice_model_found'])
        # available must be False when model is missing
        self.assertFalse(result['available'])


class TestTranscriberConstruction(unittest.TestCase):
    """LocalWhisperTranscriber constructor stores config correctly."""

    def test_default_config(self):
        t = LocalWhisperTranscriber()
        self.assertEqual(t.model_size, 'base')
        self.assertEqual(t.device, 'cpu')
        self.assertEqual(t.compute_type, 'int8')
        self.assertIsNone(t.language)

    def test_custom_config(self):
        t = LocalWhisperTranscriber(
            model_size='small',
            device='cuda',
            compute_type='float16',
            language='en',
        )
        self.assertEqual(t.model_size, 'small')
        self.assertEqual(t.device, 'cuda')
        self.assertEqual(t.compute_type, 'float16')
        self.assertEqual(t.language, 'en')

    def test_transcribe_raises_runtime_error_when_package_missing(self):
        """If faster_whisper.WhisperModel is None (stub), transcribe should raise RuntimeError."""
        import faster_whisper
        original = faster_whisper.WhisperModel
        faster_whisper.WhisperModel = None  # simulate missing
        try:
            t = LocalWhisperTranscriber()
            # Reset the module-level cached model so we hit the load path.
            import atlantean_core.local_voice as lv
            lv._whisper_model = None
            with self.assertRaises((RuntimeError, TypeError)):
                t.transcribe(b'\x00' * 100)
        finally:
            faster_whisper.WhisperModel = original
            import atlantean_core.local_voice as lv
            lv._whisper_model = None


class TestPiperTtsConstruction(unittest.TestCase):
    """LocalPiperTts constructor stores config correctly."""

    def test_default_config(self):
        p = LocalPiperTts()
        self.assertEqual(p.voice, 'en_US-lessac-medium')

    def test_custom_voice(self):
        p = LocalPiperTts(voice='en_US-amy-medium', voice_dir='/tmp/voices')
        self.assertEqual(p.voice, 'en_US-amy-medium')
        self.assertEqual(str(p.voice_dir), '/tmp/voices')

    def test_synthesize_raises_runtime_error_when_model_missing(self):
        """synthesize should raise RuntimeError when voice model file is absent."""
        p = LocalPiperTts(voice='en_US-lessac-medium', voice_dir='/nonexistent_dir_xyz')
        with self.assertRaises(RuntimeError):
            p.synthesize('hello')


if __name__ == '__main__':
    unittest.main()
