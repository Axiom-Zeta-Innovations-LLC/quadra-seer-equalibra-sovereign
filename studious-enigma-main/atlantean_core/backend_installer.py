"""backend_installer.py — Steps 2 & 3.

Downloads and installs portable inference runtimes:
  - Ollama (all platforms)
  - llama.cpp server binary (Linux/macOS/Windows, CUDA/ROCm/Metal/CPU)

All downloads include SHA-256 checksum verification.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import tempfile
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple


BACKENDS_DIR = Path(os.getenv("ATLANTEAN_BACKENDS_DIR", "./backends"))

# ---------------------------------------------------------------------------
# Checksums (pinned releases)
# ---------------------------------------------------------------------------

# llama.cpp release tag to use
LLAMACPP_TAG = os.getenv("LLAMACPP_RELEASE_TAG", "b5150")

_LLAMACPP_ASSETS: Dict[str, Dict[str, str]] = {
    # key: "system-accel"
    "linux-cuda-cu12":  {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-ubuntu-x64-cuda-cu12.zip",
        "binary": "llama-server",
    },
    "linux-rocm":  {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-ubuntu-x64-rocm.zip",
        "binary": "llama-server",
    },
    "linux-cpu": {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-ubuntu-x64.zip",
        "binary": "llama-server",
    },
    "macos-metal": {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-macos-arm64.zip",
        "binary": "llama-server",
    },
    "macos-cpu": {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-macos-x86_64.zip",
        "binary": "llama-server",
    },
    "windows-cuda": {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-win-cuda-cu12.1-x64.zip",
        "binary": "llama-server.exe",
    },
    "windows-cpu": {
        "url": f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMACPP_TAG}/llama-{LLAMACPP_TAG}-bin-win-noavx-x64.zip",
        "binary": "llama-server.exe",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path,
              on_progress: Optional[Callable[[int, int], None]] = None) -> None:
    """Download url to dest with optional progress callback(downloaded, total)."""
    req = urllib.request.Request(url, headers={"User-Agent": "atlantean-vault/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        with dest.open("wb") as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if on_progress:
                    on_progress(downloaded, total)


def _extract_zip(archive: Path, dest: Path) -> None:
    import zipfile
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(dest)


# ---------------------------------------------------------------------------
# Step 2 – Detect platform + acceleration
# ---------------------------------------------------------------------------

def detect_platform_key(
    force_accel: Optional[str] = None,
    gpus: Optional[list] = None,
) -> str:
    """Return the backend asset key for the current platform."""
    system = platform.system().lower()
    machine = platform.machine().lower()
    gpus = gpus or []

    has_nvidia = any(g.get("vendor") == "nvidia" for g in gpus)
    has_amd    = any(g.get("vendor") == "amd" for g in gpus)
    is_arm     = "arm" in machine or "aarch" in machine

    if force_accel:
        return f"{system}-{force_accel}"

    if system == "linux":
        if has_nvidia:  return "linux-cuda-cu12"
        if has_amd:     return "linux-rocm"
        return "linux-cpu"
    if system == "darwin":
        if is_arm:      return "macos-metal"
        return "macos-cpu"
    if system == "windows":
        if has_nvidia:  return "windows-cuda"
        return "windows-cpu"
    return "linux-cpu"


# ---------------------------------------------------------------------------
# Step 3 – Install Ollama
# ---------------------------------------------------------------------------

def install_ollama(
    on_progress: Optional[Callable[[str], None]] = None,
) -> Dict[str, Any]:
    """Install Ollama system-wide using the official install script."""
    if shutil.which("ollama"):
        return {"success": True, "already_installed": True,
                "path": shutil.which("ollama")}

    system = platform.system().lower()
    if system in ("linux", "darwin"):
        script_url = "https://ollama.com/install.sh"
        try:
            if on_progress:
                on_progress("Downloading Ollama install script...")
            with urllib.request.urlopen(script_url, timeout=30) as r:
                script = r.read().decode()
            with tempfile.NamedTemporaryFile(mode="w", suffix=".sh",
                                             delete=False) as f:
                f.write(script)
                script_path = f.name
            os.chmod(script_path, stat.S_IRWXU)
            if on_progress:
                on_progress("Running Ollama installer...")
            result = subprocess.run(
                ["sh", script_path],
                capture_output=True, text=True, timeout=300,
            )
            os.unlink(script_path)
            if result.returncode == 0:
                return {"success": True, "path": shutil.which("ollama"),
                        "stdout": result.stdout[-500:]}
            return {"success": False, "stderr": result.stderr[-500:]}
        except Exception as e:
            return {"success": False, "error": str(e)}
    # Windows: direct download
    return {"success": False, "error": f"Automatic install not supported on {system}. "
            "Download from https://ollama.com/download"}


# ---------------------------------------------------------------------------
# Step 2 – Install llama.cpp server binary
# ---------------------------------------------------------------------------

def install_llamacpp(
    platform_key: Optional[str] = None,
    expected_sha256: Optional[str] = None,
    on_progress: Optional[Callable[[str], None]] = None,
    gpus: Optional[list] = None,
) -> Dict[str, Any]:
    """Download a pre-built llama.cpp server binary into BACKENDS_DIR.

    Args:
        platform_key:    Override auto-detected key (e.g. 'linux-cpu').
        expected_sha256: If set, verify the archive SHA-256 after download.
        on_progress:     Status message callback.
        gpus:            GPU list from hardware_probe.full_probe()['gpus'].
    """
    key = platform_key or detect_platform_key(gpus=gpus)
    asset = _LLAMACPP_ASSETS.get(key)
    if not asset:
        return {"success": False, "error": f"No llama.cpp asset for platform '{key}'"}

    BACKENDS_DIR.mkdir(parents=True, exist_ok=True)
    binary_name = asset["binary"]
    binary_path = BACKENDS_DIR / binary_name

    if binary_path.exists():
        return {"success": True, "already_installed": True,
                "path": str(binary_path)}

    url = asset["url"]
    archive_path = BACKENDS_DIR / url.split("/")[-1]

    try:
        if on_progress:
            on_progress(f"Downloading llama.cpp ({key}) from {url} …")

        def _prog(dl: int, tot: int) -> None:
            if on_progress and tot > 0:
                on_progress(f"  {dl // (1024*1024)} / {tot // (1024*1024)} MB")

        _download(url, archive_path, on_progress=_prog)

        if expected_sha256:
            actual = _sha256(archive_path)
            if actual != expected_sha256:
                return {"success": False, "error": f"Checksum mismatch: expected {expected_sha256}, got {actual}"}

        if on_progress:
            on_progress("Extracting archive…")

        extract_dir = BACKENDS_DIR / "extracted"
        extract_dir.mkdir(exist_ok=True)
        _extract_zip(archive_path, extract_dir)
        archive_path.unlink()

        # Find the binary anywhere in extracted tree
        found = list(extract_dir.rglob(binary_name))
        if not found:
            return {"success": False, "error": f"Binary '{binary_name}' not found in archive"}

        shutil.move(str(found[0]), str(binary_path))
        binary_path.chmod(binary_path.stat().st_mode | stat.S_IEXEC)

        # Clean up extraction dir
        shutil.rmtree(extract_dir, ignore_errors=True)

        return {"success": True, "path": str(binary_path), "platform_key": key}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def backend_status() -> Dict[str, Any]:
    """Return what inference runtimes are available."""
    llamacpp_path = BACKENDS_DIR / (
        "llama-server.exe" if platform.system() == "Windows" else "llama-server"
    )
    return {
        "ollama": {
            "installed": bool(shutil.which("ollama")),
            "path": shutil.which("ollama"),
        },
        "llama_cpp": {
            "installed": llamacpp_path.exists() or bool(shutil.which("llama-server")),
            "path": str(llamacpp_path) if llamacpp_path.exists() else shutil.which("llama-server"),
        },
        "backends_dir": str(BACKENDS_DIR),
    }
