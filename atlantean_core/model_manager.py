"""model_manager.py — Steps 4 & 9.

Import, download and manage models for:
  - Language models  (GGUF / Ollama)
  - Vision models    (LLaVA, etc.)
  - Speech / Whisper models (faster-whisper)
  - Voice / Piper TTS models (.onnx)

Provides streaming progress callbacks for downloads.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Generator, List, Optional


# Model type taxonomy
MODEL_TYPES = {
    "language":  ["gguf", "bin", "safetensors"],
    "vision":    ["llava", "bakllava", "moondream"],
    "speech":    ["whisper"],
    "voice":     ["onnx"],
}

_PROGRESS_CALLBACKS: Dict[str, Callable[[Dict[str, Any]], None]] = {}
_ACTIVE_PULLS: Dict[str, Dict[str, Any]] = {}   # model_name → progress dict
_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# Step 9 – Model type detection
# ---------------------------------------------------------------------------

def detect_model_type(name: str) -> str:
    """Return 'language', 'vision', 'speech', or 'voice' from a model name/path."""
    nl = name.lower()
    if nl.endswith(".onnx"):
        return "voice"
    if any(k in nl for k in ("whisper", "faster-whisper", "distil-whisper")):
        return "speech"
    if any(k in nl for k in ("llava", "bakllava", "moondream", "clip",
                             "vision", "vl", "qwen-vl", "internvl")):
        return "vision"
    return "language"


def detect_modal_type_extended(name: str) -> Dict[str, Any]:
    """Extended type info including architecture hints."""
    base = detect_model_type(name)
    nl = name.lower()
    arch = "unknown"
    if "llama" in nl:   arch = "llama"
    elif "mistral" in nl: arch = "mistral"
    elif "phi" in nl:   arch = "phi"
    elif "qwen" in nl:  arch = "qwen"
    elif "gemma" in nl: arch = "gemma"
    elif "falcon" in nl: arch = "falcon"
    size_m = re.search(r"(\d+\.?\d*)b", nl)
    size = size_m.group(0) if size_m else None
    return {"type": base, "arch": arch, "size": size}


# ---------------------------------------------------------------------------
# Step 4 – Ollama model listing
# ---------------------------------------------------------------------------

def list_ollama_models() -> List[Dict[str, Any]]:
    """Return models installed in the local Ollama store."""
    if not shutil.which("ollama"):
        return []
    try:
        r = subprocess.run(
            ["ollama", "list", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0 and r.stdout.strip():
            raw = json.loads(r.stdout)
            models = raw if isinstance(raw, list) else raw.get("models", [])
            result = []
            for m in models:
                name = m.get("name") or m.get("model") or ""
                size_b = m.get("size") or 0
                result.append({
                    "name":      name,
                    "type":      detect_model_type(name),
                    "size_mb":   size_b // (1024 * 1024) if size_b else None,
                    "modified":  m.get("modified_at") or m.get("modified"),
                    "source":    "ollama",
                    "digest":    m.get("digest"),
                })
            return result
    except Exception:
        pass
    # Fallback: parse text output
    try:
        r = subprocess.run(
            ["ollama", "list"],
            capture_output=True, text=True, timeout=10,
        )
        result = []
        for line in r.stdout.splitlines()[1:]:  # skip header
            parts = line.split()
            if parts:
                name = parts[0]
                result.append({
                    "name": name, "type": detect_model_type(name),
                    "size_mb": None, "source": "ollama",
                })
        return result
    except Exception:
        return []


def list_gguf_models(model_dirs: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Scan local directories for .gguf files."""
    dirs = model_dirs or [
        "./models",
        os.path.expanduser("~/.cache/lm-studio/models"),
        os.path.expanduser("~/.local/share/nomic.ai/gpt4all/models"),
    ]
    result = []
    for d in dirs:
        p = Path(d)
        if not p.exists():
            continue
        for f in p.rglob("*.gguf"):
            stat = f.stat()
            result.append({
                "name":     f.stem,
                "path":     str(f),
                "type":     detect_model_type(f.name),
                "size_mb":  stat.st_size // (1024 * 1024),
                "source":   "local",
            })
    return result


def list_whisper_models() -> List[Dict[str, Any]]:
    """List faster-whisper cached models."""
    cache_root = Path(os.path.expanduser("~/.cache/huggingface/hub"))
    result = []
    for path in cache_root.glob("models--Systran--faster-whisper-*"):
        size_tag = path.name.replace("models--Systran--faster-whisper-", "")
        result.append({
            "name":   f"whisper:{size_tag}",
            "type":   "speech",
            "source": "huggingface",
            "path":   str(path),
        })
    return result


def list_piper_voices(voice_dir: str = "./voices") -> List[Dict[str, Any]]:
    """List Piper voice models in voice_dir."""
    result = []
    vd = Path(voice_dir)
    if not vd.exists():
        return result
    for f in vd.glob("*.onnx"):
        cfg = f.with_suffix(".onnx.json")
        sample_rate = None
        if cfg.exists():
            try:
                data = json.loads(cfg.read_text())
                sample_rate = data.get("audio", {}).get("sample_rate")
            except Exception:
                pass
        result.append({
            "name":        f.stem,
            "type":        "voice",
            "path":        str(f),
            "has_config":  cfg.exists(),
            "sample_rate": sample_rate,
            "source":      "local",
        })
    return result


def list_all_models(voice_dir: str = "./voices") -> Dict[str, List[Dict[str, Any]]]:
    """Return all models grouped by type."""
    return {
        "language": list_ollama_models() + list_gguf_models(),
        "speech":   list_whisper_models(),
        "voice":    list_piper_voices(voice_dir),
    }


# ---------------------------------------------------------------------------
# Step 4 – Pull with streaming progress
# ---------------------------------------------------------------------------

def pull_ollama_model(
    model_name: str,
    on_progress: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Generator[Dict[str, Any], None, None]:
    """Pull an Ollama model and yield progress events.

    Yields dicts::

        {"status": "downloading", "digest": "...", "completed": 12345,
         "total": 98765, "percent": 12.5}
    """
    if not shutil.which("ollama"):
        yield {"status": "error", "error": "Ollama not installed"}
        return

    cmd = ["ollama", "pull", model_name, "--json"]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except Exception as e:
        yield {"status": "error", "error": str(e)}
        return

    with _LOCK:
        _ACTIVE_PULLS[model_name] = {"status": "starting", "percent": 0}

    try:
        for line in proc.stdout or []:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                data = {"status": line}

            completed = data.get("completed") or 0
            total = data.get("total") or 1
            pct = round(completed / total * 100, 1) if total > 0 else 0.0

            event = {
                "model":     model_name,
                "status":    data.get("status", "downloading"),
                "digest":    data.get("digest", ""),
                "completed": completed,
                "total":     total,
                "percent":   pct,
            }
            with _LOCK:
                _ACTIVE_PULLS[model_name] = event

            if on_progress:
                on_progress(event)
            yield event

        proc.wait()
        final = {"model": model_name, "status": "success" if proc.returncode == 0 else "error",
                 "returncode": proc.returncode, "percent": 100.0}
        yield final
    except Exception as e:
        yield {"model": model_name, "status": "error", "error": str(e)}
    finally:
        with _LOCK:
            _ACTIVE_PULLS.pop(model_name, None)


def get_pull_progress(model_name: str) -> Optional[Dict[str, Any]]:
    """Return latest progress for an in-flight pull, or None."""
    with _LOCK:
        return _ACTIVE_PULLS.get(model_name)


# ---------------------------------------------------------------------------
# Step 4 – Import local model
# ---------------------------------------------------------------------------

def import_gguf_to_ollama(
    gguf_path: str,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Create an Ollama model from a local GGUF file via a Modelfile."""
    path = Path(gguf_path)
    if not path.exists():
        return {"success": False, "error": f"File not found: {gguf_path}"}
    if not shutil.which("ollama"):
        return {"success": False, "error": "Ollama not installed"}

    tag = model_name or path.stem.lower().replace(" ", "-")
    modelfile = f"FROM {path.absolute()}\n"
    modelfile_path = path.with_suffix(".Modelfile")
    modelfile_path.write_text(modelfile)

    try:
        r = subprocess.run(
            ["ollama", "create", tag, "-f", str(modelfile_path)],
            capture_output=True, text=True, timeout=120,
        )
        return {
            "success": r.returncode == 0,
            "model_name": tag,
            "stdout": r.stdout.strip(),
            "stderr": r.stderr.strip(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        try:
            modelfile_path.unlink()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Step 4 – Delete model
# ---------------------------------------------------------------------------

def delete_ollama_model(model_name: str) -> Dict[str, Any]:
    """Remove an Ollama model."""
    if not shutil.which("ollama"):
        return {"success": False, "error": "Ollama not installed"}
    r = subprocess.run(
        ["ollama", "rm", model_name],
        capture_output=True, text=True, timeout=30,
    )
    return {
        "success": r.returncode == 0,
        "stdout": r.stdout.strip(),
        "stderr": r.stderr.strip(),
    }
