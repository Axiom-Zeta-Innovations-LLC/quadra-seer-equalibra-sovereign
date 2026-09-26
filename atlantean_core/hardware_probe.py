"""hardware_probe.py — Steps 1 & 8.

Detects NVIDIA, AMD, Intel, Apple Silicon, CPU and NPU acceleration,
reports RAM, VRAM and current utilisation.  All probes are non-blocking
subprocess calls; missing tools are reported gracefully, never raised.
"""
from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(cmd: List[str], timeout: int = 5) -> str:
    """Run a command and return stdout; return '' on any error."""
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout
        )
        return r.stdout.strip()
    except Exception:
        return ""


def _cmd_ok(cmd: str) -> bool:
    return bool(shutil.which(cmd))


# ---------------------------------------------------------------------------
# Step 1 – NVIDIA
# ---------------------------------------------------------------------------

def probe_nvidia() -> List[Dict[str, Any]]:
    """Return list of NVIDIA GPUs detected via nvidia-smi."""
    gpus: List[Dict[str, Any]] = []
    if not _cmd_ok("nvidia-smi"):
        return gpus
    out = _run([
        "nvidia-smi",
        "--query-gpu=index,name,memory.total,memory.used,memory.free,"
        "temperature.gpu,utilization.gpu,driver_version",
        "--format=csv,noheader,nounits",
    ])
    for line in out.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 8:
            continue
        try:
            gpus.append({
                "index":        int(parts[0]),
                "name":         parts[1],
                "vram_total_mb": int(parts[2]),
                "vram_used_mb":  int(parts[3]),
                "vram_free_mb":  int(parts[4]),
                "temp_c":        int(parts[5]) if parts[5].isdigit() else None,
                "util_pct":      int(parts[6]) if parts[6].isdigit() else None,
                "driver":        parts[7],
                "vendor":        "nvidia",
                "compute_api":   "cuda",
            })
        except (ValueError, IndexError):
            continue
    return gpus


# ---------------------------------------------------------------------------
# Step 1 – AMD (ROCm)
# ---------------------------------------------------------------------------

def probe_amd() -> List[Dict[str, Any]]:
    """Return list of AMD GPUs detected via rocm-smi."""
    gpus: List[Dict[str, Any]] = []
    if not _cmd_ok("rocm-smi"):
        return gpus
    out = _run(["rocm-smi", "--showid", "--showvbios", "--showmeminfo", "vram", "--json"])
    if not out:
        return gpus
    try:
        data = json.loads(out)
        for key, val in data.items():
            if not key.startswith("card"):
                continue
            vram_used = int(val.get("VRAM Total Used Memory (B)", 0)) // (1024 * 1024)
            vram_total = int(val.get("VRAM Total Memory (B)", 0)) // (1024 * 1024)
            gpus.append({
                "index":         int(re.sub(r"[^0-9]", "", key) or "0"),
                "name":          val.get("Card Series", "AMD GPU"),
                "vram_total_mb": vram_total,
                "vram_used_mb":  vram_used,
                "vram_free_mb":  vram_total - vram_used,
                "temp_c":        None,
                "util_pct":      None,
                "driver":        val.get("Driver version", ""),
                "vendor":        "amd",
                "compute_api":   "rocm",
            })
    except Exception:
        pass
    return gpus


# ---------------------------------------------------------------------------
# Step 1 – Intel GPU (vainfo / Intel OpenCL)
# ---------------------------------------------------------------------------

def probe_intel_gpu() -> List[Dict[str, Any]]:
    """Detect Intel discrete/integrated GPU via vainfo or lspci."""
    gpus: List[Dict[str, Any]] = []
    name = ""
    # Try vainfo (VA-API)
    if _cmd_ok("vainfo"):
        out = _run(["vainfo"])
        m = re.search(r"VA-API version.*?\n.*?Driver.+?:\s+(.+)", out, re.DOTALL)
        if m:
            name = m.group(1).strip()
    # Fallback to lspci
    if not name and _cmd_ok("lspci"):
        out = _run(["lspci"])
        m = re.search(r"(Intel.*?(Graphics|GPU|HD|UHD|Iris|Arc)\s*[^\n]*)", out)
        if m:
            name = m.group(1).strip()
    if not name:
        return gpus
    gpus.append({
        "index":         0,
        "name":          name,
        "vram_total_mb": None,  # not easily available without iGPU memory split info
        "vram_used_mb":  None,
        "vram_free_mb":  None,
        "temp_c":        None,
        "util_pct":      None,
        "driver":        "",
        "vendor":        "intel",
        "compute_api":   "opencl",
    })
    return gpus


# ---------------------------------------------------------------------------
# Step 1 – Intel NPU (OpenVINO / AI Boost)
# ---------------------------------------------------------------------------

def probe_intel_npu() -> Optional[Dict[str, Any]]:
    """Detect Intel NPU (Meteor Lake / AI Boost) via OpenVINO or npu-top."""
    # Check via OpenVINO Python binding
    try:
        from openvino.runtime import Core  # type: ignore[import]
        core = Core()
        devices = core.available_devices
        npu_devices = [d for d in devices if "NPU" in d.upper()]
        if npu_devices:
            props = core.get_property(npu_devices[0], "FULL_DEVICE_NAME")
            return {
                "name": str(props),
                "vendor": "intel",
                "compute_api": "openvino_npu",
                "ov_device_id": npu_devices[0],
            }
    except Exception:
        pass
    # Fallback: lspci
    if _cmd_ok("lspci"):
        out = _run(["lspci"])
        if re.search(r"NPU|Neural.*Processing|AI\s*Boost", out, re.I):
            return {
                "name": "Intel NPU (detected via lspci)",
                "vendor": "intel",
                "compute_api": "openvino_npu",
                "ov_device_id": "NPU",
            }
    return None


# ---------------------------------------------------------------------------
# Step 1 – Apple Silicon (MPS)
# ---------------------------------------------------------------------------

def probe_apple_silicon() -> Optional[Dict[str, Any]]:
    """Detect Apple Silicon and unified memory."""
    if platform.system() != "Darwin":
        return None
    machine = platform.machine().lower()
    if machine not in ("arm64", "aarch64"):
        return None
    chip = _run(["sysctl", "-n", "machdep.cpu.brand_string"])
    if not chip:
        chip = platform.processor() or "Apple Silicon"
    # Unified memory total
    mem_bytes = _run(["sysctl", "-n", "hw.memsize"])
    mem_mb = int(mem_bytes) // (1024 * 1024) if mem_bytes.isdigit() else None
    return {
        "name": chip,
        "vendor": "apple",
        "compute_api": "mps",
        "unified_memory_mb": mem_mb,
    }


# ---------------------------------------------------------------------------
# Step 8 – RAM
# ---------------------------------------------------------------------------

def probe_ram() -> Dict[str, Any]:
    """Return system RAM usage in MB."""
    try:
        import psutil  # type: ignore[import]
        vm = psutil.virtual_memory()
        return {
            "total_mb":     vm.total // (1024 * 1024),
            "available_mb": vm.available // (1024 * 1024),
            "used_mb":      vm.used // (1024 * 1024),
            "percent":      vm.percent,
        }
    except ImportError:
        pass
    # Fallback: /proc/meminfo
    try:
        info: Dict[str, int] = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    info[parts[0].rstrip(":")] = int(parts[1])
        total_mb = info.get("MemTotal", 0) // 1024
        free_mb = (info.get("MemFree", 0) + info.get("Buffers", 0)
                   + info.get("Cached", 0)) // 1024
        return {
            "total_mb":     total_mb,
            "available_mb": free_mb,
            "used_mb":      total_mb - free_mb,
            "percent":      round((total_mb - free_mb) / max(total_mb, 1) * 100, 1),
        }
    except Exception:
        return {"total_mb": None, "available_mb": None, "used_mb": None, "percent": None}


# ---------------------------------------------------------------------------
# Step 8 – CPU info
# ---------------------------------------------------------------------------

def probe_cpu() -> Dict[str, Any]:
    """Return CPU name, core count, and current utilisation."""
    name = platform.processor() or "Unknown CPU"
    # Better name via lscpu on Linux
    if platform.system() == "Linux" and _cmd_ok("lscpu"):
        out = _run(["lscpu"])
        m = re.search(r"Model name\s*:\s*(.+)", out)
        if m:
            name = m.group(1).strip()
    physical_cores = None
    logical_cores = None
    util_pct = None
    try:
        import psutil  # type: ignore[import]
        physical_cores = psutil.cpu_count(logical=False)
        logical_cores = psutil.cpu_count(logical=True)
        util_pct = psutil.cpu_percent(interval=0.1)
    except ImportError:
        pass
    return {
        "name": name,
        "physical_cores": physical_cores,
        "logical_cores": logical_cores,
        "util_pct": util_pct,
        "arch": platform.machine(),
    }


# ---------------------------------------------------------------------------
# Full probe
# ---------------------------------------------------------------------------

def full_probe() -> Dict[str, Any]:
    """Run all hardware probes and return a combined report."""
    gpus: List[Dict[str, Any]] = []
    gpus.extend(probe_nvidia())
    gpus.extend(probe_amd())
    gpus.extend(probe_intel_gpu())

    apple = probe_apple_silicon()
    npu = probe_intel_npu()

    # Recommended compute tier
    nvidia_vram = max((g["vram_total_mb"] or 0 for g in gpus if g["vendor"] == "nvidia"), default=0)
    amd_vram    = max((g["vram_total_mb"] or 0 for g in gpus if g["vendor"] == "amd"),    default=0)
    best_vram   = max(nvidia_vram, amd_vram)
    ram_info    = probe_ram()
    ram_gb      = (ram_info.get("total_mb") or 0) // 1024

    if apple:
        tier = "medium" if (apple.get("unified_memory_mb") or 0) >= 16_384 else "small_quantized"
    elif best_vram >= 16_384:
        tier = "multi_agent"
    elif best_vram >= 8_192:
        tier = "medium"
    else:
        tier = "small_quantized"

    return {
        "timestamp": int(time.time() * 1000),
        "platform": platform.system(),
        "cpu": probe_cpu(),
        "ram": ram_info,
        "gpus": gpus,
        "apple_silicon": apple,
        "npu": npu,
        "best_vram_mb": best_vram if best_vram > 0 else None,
        "recommended_tier": tier,
        "compute_backends_available": _available_compute_backends(gpus, apple, npu),
    }


def _available_compute_backends(
    gpus: List[Dict[str, Any]],
    apple: Optional[Dict[str, Any]],
    npu: Optional[Dict[str, Any]],
) -> List[str]:
    backends = ["cpu"]
    vendors = {g["vendor"] for g in gpus}
    if "nvidia" in vendors:
        backends.append("cuda")
    if "amd" in vendors:
        backends.append("rocm")
    if "intel" in vendors:
        backends.append("opencl")
    if apple:
        backends.append("metal")
        backends.append("mps")
    if npu:
        backends.append("npu")
    return backends
