"""process_manager.py — Steps 5 & 6.

Manages local inference backend processes (Ollama, llama.cpp server, Whisper
daemon).  Handles port allocation, process start/stop, and health polling.
"""
from __future__ import annotations

import os
import platform
import shutil
import signal
import socket
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Step 6 – Port utilities
# ---------------------------------------------------------------------------

def is_port_free(port: int, host: str = "127.0.0.1") -> bool:
    """Return True if TCP port is not currently in use."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.3)
            return s.connect_ex((host, port)) != 0
    except OSError:
        return True


def find_free_port(start: int = 11434, end: int = 11500) -> int:
    """Return first free port in [start, end).  Raises RuntimeError if none found."""
    for port in range(start, end):
        if is_port_free(port):
            return port
    raise RuntimeError(f"No free port found in range {start}–{end}")


def wait_for_port(port: int, host: str = "127.0.0.1",
                  timeout: float = 30.0, interval: float = 0.5) -> bool:
    """Block until a port accepts connections or timeout expires."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not is_port_free(port, host):
            return True
        time.sleep(interval)
    return False


# ---------------------------------------------------------------------------
# Process registry
# ---------------------------------------------------------------------------

_registry: Dict[str, "ManagedProcess"] = {}
_lock = threading.Lock()


class ManagedProcess:
    """Wraps a subprocess with health-check and lifecycle management."""

    def __init__(
        self,
        name: str,
        cmd: List[str],
        port: int,
        health_url: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str] = None,
    ) -> None:
        self.name = name
        self.cmd = cmd
        self.port = port
        self.health_url = health_url
        self.env = {**os.environ, **(env or {})}
        self.cwd = cwd
        self._proc: Optional[subprocess.Popen] = None  # type: ignore[type-arg]
        self._started_at: Optional[float] = None
        self._log_lines: List[str] = []

    # -- lifecycle --------------------------------------------------------- #

    def start(self) -> None:
        if self._proc and self._proc.poll() is None:
            return  # already running
        self._log_lines.clear()
        self._proc = subprocess.Popen(
            self.cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=self.env,
            cwd=self.cwd,
        )
        self._started_at = time.time()
        # Background log collector
        t = threading.Thread(target=self._collect_logs, daemon=True)
        t.start()

    def stop(self, graceful_timeout: float = 5.0) -> None:
        proc = self._proc
        if not proc:
            return
        if proc.poll() is not None:
            return  # already exited
        proc.terminate()
        try:
            proc.wait(timeout=graceful_timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
        self._proc = None

    def restart(self) -> None:
        self.stop()
        time.sleep(0.5)
        self.start()

    # -- status ------------------------------------------------------------ #

    @property
    def pid(self) -> Optional[int]:
        return self._proc.pid if self._proc else None

    @property
    def running(self) -> bool:
        return bool(self._proc and self._proc.poll() is None)

    @property
    def uptime_s(self) -> Optional[float]:
        if self._started_at and self.running:
            return round(time.time() - self._started_at, 1)
        return None

    def health_ok(self) -> bool:
        """Return True if the process is running and the health URL responds."""
        if not self.running:
            return False
        if self.health_url:
            import urllib.request, urllib.error
            try:
                urllib.request.urlopen(self.health_url, timeout=2)
                return True
            except Exception:
                return False
        return not is_port_free(self.port)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name":       self.name,
            "pid":        self.pid,
            "running":    self.running,
            "port":       self.port,
            "uptime_s":   self.uptime_s,
            "healthy":    self.health_ok(),
            "recent_log": self._log_lines[-20:],
        }

    # -- internals --------------------------------------------------------- #

    def _collect_logs(self) -> None:
        proc = self._proc
        if not proc or not proc.stdout:
            return
        try:
            for line in proc.stdout:
                self._log_lines.append(line.rstrip("\n"))
                if len(self._log_lines) > 500:
                    self._log_lines = self._log_lines[-400:]
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Step 5 – Start / stop helpers
# ---------------------------------------------------------------------------

def start_ollama(port: int = 11434) -> ManagedProcess:
    """Start the Ollama server on `port`."""
    binary = shutil.which("ollama")
    if not binary:
        raise RuntimeError("Ollama binary not found. Run: bash scripts/install_backend.sh")
    with _lock:
        existing = _registry.get("ollama")
        if existing and existing.running:
            return existing
        p = ManagedProcess(
            name="ollama",
            cmd=[binary, "serve"],
            port=port,
            health_url=f"http://127.0.0.1:{port}/",
            env={"OLLAMA_HOST": f"127.0.0.1:{port}"},
        )
        p.start()
        _registry["ollama"] = p
        return p


def start_llamacpp_server(
    model_path: str,
    port: int = 8080,
    n_gpu_layers: int = 0,
    ctx_size: int = 4096,
    extra_args: Optional[List[str]] = None,
) -> ManagedProcess:
    """Start a llama.cpp HTTP server for the given GGUF model."""
    binary = shutil.which("llama-server") or shutil.which("llama.cpp")
    if not binary:
        binary_path = Path("./backends/llama-server")
        if not binary_path.exists():
            raise RuntimeError(
                "llama-server not found. Run: bash scripts/install_backend.sh"
            )
        binary = str(binary_path)

    cmd = [
        binary,
        "--model", model_path,
        "--port", str(port),
        "--host", "127.0.0.1",
        "--n-gpu-layers", str(n_gpu_layers),
        "--ctx-size", str(ctx_size),
    ] + (extra_args or [])

    with _lock:
        key = f"llamacpp:{port}"
        existing = _registry.get(key)
        if existing and existing.running:
            return existing
        p = ManagedProcess(
            name=f"llama.cpp:{port}",
            cmd=cmd,
            port=port,
            health_url=f"http://127.0.0.1:{port}/health",
        )
        p.start()
        _registry[key] = p
        return p


def stop_process(name_or_port: str) -> bool:
    """Stop a managed process by name or 'llamacpp:<port>'."""
    with _lock:
        p = _registry.get(name_or_port)
        if p:
            p.stop()
            return True
    return False


def list_processes() -> List[Dict[str, Any]]:
    """Return status of all managed processes."""
    with _lock:
        return [p.to_dict() for p in _registry.values()]


def get_process(name: str) -> Optional[ManagedProcess]:
    with _lock:
        return _registry.get(name)
