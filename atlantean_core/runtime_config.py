"""runtime_config.py — Step 7.

Computes optimal GPU layers, context sizes and backend launch arguments
from a hardware probe report.  Pure functions — no I/O.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional


# Model size → approximate VRAM per layer at Q4 (MB).
# Used to estimate how many layers fit in VRAM.
_VRAM_PER_LAYER_Q4: Dict[str, float] = {
    "3b":  28,
    "7b":  52,
    "8b":  58,
    "13b": 95,
    "14b": 100,
    "32b": 220,
    "70b": 480,
}


def estimate_model_size_tag(model_name: str) -> str:
    """Extract size tag (e.g. '8b') from a model name string."""
    import re
    m = re.search(r"(\d+\.?\d*)b", model_name.lower())
    return m.group(1).replace(".", "") + "b" if m else "7b"


# ---------------------------------------------------------------------------
# Step 7 – GPU layer calculation
# ---------------------------------------------------------------------------

def recommend_gpu_layers(
    vram_mb: Optional[int],
    model_name: str = "7b",
    reserve_mb: int = 512,
    quant: str = "q4",
) -> int:
    """Return recommended --n-gpu-layers for llama.cpp given VRAM.

    Args:
        vram_mb:    Available VRAM in MB.  None → CPU only (0 layers).
        model_name: Model name or size tag (e.g. 'llama3.1:8b').
        reserve_mb: MB to keep free for OS/display/other processes.
        quant:      Quantisation level (q4, q8, fp16) for VRAM-per-layer estimate.

    Returns:
        Number of layers to offload (0 = CPU only, 99 = all layers).
    """
    if not vram_mb or vram_mb <= 0:
        return 0

    usable_mb = max(vram_mb - reserve_mb, 0)
    if usable_mb <= 0:
        return 0

    size_tag = estimate_model_size_tag(model_name)
    # Scale VRAM per layer by quant factor
    quant_scale = {"q4": 1.0, "q8": 2.0, "fp16": 4.0}.get(quant, 1.0)
    base_vram_per_layer = _VRAM_PER_LAYER_Q4.get(size_tag, 52)
    vram_per_layer = base_vram_per_layer * quant_scale

    # Typical layer counts
    total_layers = {"3b": 26, "7b": 32, "8b": 32, "13b": 40, "14b": 40,
                    "32b": 64, "70b": 80}.get(size_tag, 32)

    layers = min(math.floor(usable_mb / vram_per_layer), total_layers)
    return max(0, layers)


# ---------------------------------------------------------------------------
# Step 7 – Context size recommendation
# ---------------------------------------------------------------------------

def recommend_context_size(
    ram_mb: Optional[int],
    vram_mb: Optional[int],
    model_name: str = "7b",
    max_ctx: int = 131_072,
) -> int:
    """Return a safe context window size given available RAM.

    Uses ~0.5 MB per token at 4-bit for the KV cache.  Conservative: caps at
    half available RAM so the system remains responsive.
    """
    size_tag = estimate_model_size_tag(model_name)
    kv_bytes_per_token = {"3b": 0.3, "7b": 0.5, "8b": 0.55,
                          "13b": 0.8, "14b": 0.85, "32b": 1.6,
                          "70b": 3.0}.get(size_tag, 0.5) * 1024 * 1024

    best_mb = max(ram_mb or 0, vram_mb or 0)
    if best_mb <= 0:
        return 2048

    usable_mb = best_mb * 0.4  # keep 60% for model weights + OS
    max_tokens = int((usable_mb * 1024 * 1024) / kv_bytes_per_token)

    # Snap to power-of-two buckets
    for ctx in [2048, 4096, 8192, 16384, 32768, 65536, 131072]:
        if max_tokens < ctx:
            return max(2048, ctx // 2)

    return min(max_tokens, max_ctx)


# ---------------------------------------------------------------------------
# Step 7 – Full recommendation
# ---------------------------------------------------------------------------

def recommend_runtime(
    probe: Dict[str, Any],
    model_name: str,
    backend: str = "auto",
) -> Dict[str, Any]:
    """Given a hardware probe + model name, return full runtime config.

    Returns::

        {
            "backend":       "ollama" | "llama.cpp",
            "n_gpu_layers":  int,
            "context_size":  int,
            "compute_type":  "cuda" | "metal" | "cpu" | ...,
            "args":          list[str],   # extra launch flags
            "notes":         list[str],
        }
    """
    gpus: List[Dict[str, Any]] = probe.get("gpus", [])
    apple = probe.get("apple_silicon")
    ram_mb = (probe.get("ram") or {}).get("total_mb")
    notes: List[str] = []

    # Pick best VRAM source
    best_vram_mb: Optional[int] = None
    compute_type = "cpu"

    nvidia_gpus = [g for g in gpus if g["vendor"] == "nvidia"]
    amd_gpus    = [g for g in gpus if g["vendor"] == "amd"]

    if nvidia_gpus:
        best_gpu = max(nvidia_gpus, key=lambda g: g.get("vram_total_mb") or 0)
        best_vram_mb = best_gpu.get("vram_total_mb")
        compute_type = "cuda"
    elif amd_gpus:
        best_gpu = max(amd_gpus, key=lambda g: g.get("vram_total_mb") or 0)
        best_vram_mb = best_gpu.get("vram_total_mb")
        compute_type = "rocm"
    elif apple:
        best_vram_mb = apple.get("unified_memory_mb")
        compute_type = "metal"
        notes.append("Apple Silicon: unified memory shared between CPU and GPU")

    # Resolve backend
    if backend == "auto":
        backend = "ollama"  # prefer Ollama for convenience

    n_gpu_layers = recommend_gpu_layers(best_vram_mb, model_name)
    context_size = recommend_context_size(ram_mb, best_vram_mb, model_name)

    args: List[str] = []
    if backend == "llama.cpp":
        if n_gpu_layers > 0:
            args += [f"--n-gpu-layers", str(n_gpu_layers)]
        args += ["--ctx-size", str(context_size)]
        if compute_type == "cuda":
            args += ["--gpu-layers-draft", "0"]

    if n_gpu_layers == 0:
        notes.append("Running in CPU-only mode — consider a smaller/more-quantised model")
    else:
        notes.append(f"Offloading {n_gpu_layers} layers to {compute_type.upper()}")

    return {
        "backend":       backend,
        "n_gpu_layers":  n_gpu_layers,
        "context_size":  context_size,
        "compute_type":  compute_type,
        "vram_mb":       best_vram_mb,
        "ram_mb":        ram_mb,
        "extra_args":    args,
        "notes":         notes,
    }
