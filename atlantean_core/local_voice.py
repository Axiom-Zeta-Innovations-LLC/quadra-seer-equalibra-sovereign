"""Local offline voice pipeline (Step 31).

Provides two drop-in adapters that require no cloud credentials:
- LocalWhisperTranscriber  — audio bytes → transcript text via faster-whisper
- LocalPiperTts            — text → WAV bytes via Piper TTS (ONNX, CPU/GPU)

Both adapters fail at *use-time* (not import-time) if the underlying library is
missing, so the Flask endpoints can return 503 and let the frontend fall back to
browser built-ins gracefully.

Install dependencies:
    pip install faster-whisper piper-tts

Download a Piper voice model (e.g. en_US-lessac-medium):
    mkdir -p voices
    curl -L -o voices/en_US-lessac-medium.onnx \
        https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-lessac-medium.onnx
    curl -L -o voices/en_US-lessac-medium.onnx.json \
        https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-lessac-medium.onnx.json
"""

from __future__ import annotations

import base64
import io
import os
import shutil
import struct
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# STT — faster-whisper
# ---------------------------------------------------------------------------

_whisper_lock = threading.Lock()
_whisper_model: Any = None  # lazy singleton


def _load_whisper_model(model_size: str, device: str, compute_type: str) -> Any:
    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            try:
                from faster_whisper import WhisperModel  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError(
                    "faster-whisper is not installed. "
                    "Run: pip install faster-whisper"
                ) from exc
            if WhisperModel is None or not callable(WhisperModel):
                raise RuntimeError(
                    "faster-whisper is not available (stub or import failed). "
                    "Run: pip install faster-whisper"
                )
            _whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
        return _whisper_model


class LocalWhisperTranscriber:
    """Transcribe audio using faster-whisper (CPU or CUDA)."""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
        language: Optional[str] = None,
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.language = language or None

    def transcribe(self, audio_bytes: bytes) -> Dict[str, Any]:
        """Transcribe *audio_bytes* (any format libav/ffmpeg can read).

        Returns::

            {
                "transcript": str,        # full concatenated text
                "language": str,          # detected or forced language code
                "segments": [             # per-segment detail
                    {"start": float, "end": float, "text": str},
                    ...
                ]
            }
        """
        model = _load_whisper_model(self.model_size, self.device, self.compute_type)

        # faster-whisper reads from a file path, so write to a temp file.
        suffix = ".webm"  # browser MediaRecorder default; ffmpeg handles it
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            segments_iter, info = model.transcribe(
                tmp_path,
                language=self.language,
                beam_size=5,
                vad_filter=True,
            )
            seg_list: List[Dict[str, Any]] = []
            parts: List[str] = []
            for seg in segments_iter:
                text = seg.text.strip()
                if text:
                    seg_list.append({"start": seg.start, "end": seg.end, "text": text})
                    parts.append(text)
            return {
                "transcript": " ".join(parts),
                "language": info.language,
                "segments": seg_list,
            }
        finally:
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# TTS — Piper
# ---------------------------------------------------------------------------

_piper_lock = threading.Lock()
_piper_voice_cache: Dict[str, Any] = {}  # voice_key → loaded PiperVoice instance


class LocalPiperTts:
    """Synthesise text to speech offline using Piper TTS.

    Resolution order for each synthesis call:
    1. ``piper-tts`` Python package  (``pip install piper-tts``)
    2. ``piper`` CLI binary on PATH

    Both paths look for ``<voice_dir>/<voice>.onnx`` and
    ``<voice_dir>/<voice>.onnx.json``.
    """

    def __init__(
        self,
        voice: str = "en_US-lessac-medium",
        voice_dir: Optional[str] = None,
    ) -> None:
        self.voice = voice
        self.voice_dir = Path(voice_dir or "./voices")

    # -- path resolution -------------------------------------------------- #

    def _resolve_onnx(self, voice: str) -> Path:
        candidates = [
            self.voice_dir / f"{voice}.onnx",
            self.voice_dir / voice / f"{voice}.onnx",
            Path.home() / ".local" / "share" / "piper" / "voices" / f"{voice}.onnx",
            Path("/usr/share/piper/voices") / f"{voice}.onnx",
        ]
        for p in candidates:
            if p.exists():
                return p
        raise RuntimeError(
            f"Piper voice model not found for '{voice}'. "
            f"Download it and place the .onnx + .onnx.json files in {self.voice_dir}/. "
            "See scripts/setup_local_voice.sh for automation."
        )

    # -- synthesis -------------------------------------------------------- #

    def synthesize(self, text: str, voice: Optional[str] = None) -> Dict[str, Any]:
        """Synthesise *text* and return WAV bytes + metadata.

        Returns::

            {
                "audio_bytes":  bytes,   # complete WAV file (PCM 16-bit)
                "audio_base64": str,     # base64-encoded WAV
                "format":       "wav",
                "sample_rate":  int,     # read from WAV header
            }
        """
        voice = voice or self.voice
        try:
            return self._via_package(text, voice)
        except ImportError:
            pass  # library not installed → try CLI
        except RuntimeError:
            raise  # model-not-found and similar should propagate
        except Exception:
            pass  # unexpected package error → try CLI

        return self._via_cli(text, voice)

    def _via_package(self, text: str, voice: str) -> Dict[str, Any]:
        from piper import PiperVoice  # type: ignore[import]

        onnx = self._resolve_onnx(voice)
        cfg = Path(str(onnx) + ".json")
        if not cfg.exists():
            raise RuntimeError(f"Piper config JSON not found: {cfg}")

        cache_key = str(onnx)
        with _piper_lock:
            if cache_key not in _piper_voice_cache:
                _piper_voice_cache[cache_key] = PiperVoice.load(
                    str(onnx), config_path=str(cfg), use_cuda=False
                )
            pv = _piper_voice_cache[cache_key]

        buf = io.BytesIO()
        pv.synthesize_wav(text, buf)
        buf.seek(0)
        wav = buf.read()
        return {
            "audio_bytes": wav,
            "audio_base64": base64.b64encode(wav).decode(),
            "format": "wav",
            "sample_rate": _wav_sample_rate(wav),
        }

    def _via_cli(self, text: str, voice: str) -> Dict[str, Any]:
        binary = shutil.which("piper") or shutil.which("piper-tts")
        if not binary:
            raise RuntimeError(
                "Neither the piper-tts Python package nor the piper CLI binary "
                "is available. Install one: pip install piper-tts  or  "
                "see scripts/setup_local_voice.sh."
            )
        onnx = self._resolve_onnx(voice)
        cfg = Path(str(onnx) + ".json")

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out:
            out_path = out.name
        try:
            cmd = [binary, "--model", str(onnx), "--output_file", out_path]
            if cfg.exists():
                cmd += ["--config", str(cfg)]
            result = subprocess.run(
                cmd,
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )
            if result.returncode != 0:
                err = result.stderr.decode(errors="replace")[:400]
                raise RuntimeError(f"piper exited {result.returncode}: {err}")
            wav = Path(out_path).read_bytes()
            return {
                "audio_bytes": wav,
                "audio_base64": base64.b64encode(wav).decode(),
                "format": "wav",
                "sample_rate": _wav_sample_rate(wav),
            }
        finally:
            try:
                Path(out_path).unlink(missing_ok=True)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _wav_sample_rate(wav: bytes) -> int:
    """Extract sample rate from bytes 24–27 of a standard WAV header."""
    try:
        if len(wav) >= 28 and wav[:4] == b"RIFF":
            return struct.unpack_from("<I", wav, 24)[0]
    except Exception:
        pass
    return 22050  # Piper default


def check_whisper_available() -> Dict[str, Any]:
    """Return availability status for the diagnostics endpoint."""
    try:
        import faster_whisper  # noqa: F401  type: ignore[import]
        return {"available": True, "package": "faster-whisper"}
    except ImportError:
        return {"available": False, "reason": "faster-whisper not installed"}


def check_piper_available(voice_dir: str = "./voices", voice: str = "en_US-lessac-medium") -> Dict[str, Any]:
    """Return availability status for the diagnostics endpoint."""
    pkg_ok = False
    try:
        import piper  # noqa: F401  type: ignore[import]
        pkg_ok = True
    except ImportError:
        pass

    cli_ok = bool(shutil.which("piper") or shutil.which("piper-tts"))
    onnx_path = Path(voice_dir) / f"{voice}.onnx"
    model_ok = onnx_path.exists()

    return {
        "available": (pkg_ok or cli_ok) and model_ok,
        "package_installed": pkg_ok,
        "cli_available": cli_ok,
        "voice_model_found": model_ok,
        "voice_model_path": str(onnx_path),
        "configured_voice": voice,
    }
