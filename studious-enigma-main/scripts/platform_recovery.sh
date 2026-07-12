#!/usr/bin/env bash
# =============================================================================
# platform_recovery.sh — Step 10: Platform-specific inference recovery.
#
# Run when the Vault fails to start inference, a model hangs, or after a
# system update that breaks GPU drivers.
#
# Usage:
#   bash scripts/platform_recovery.sh [--platform nvidia|amd|intel|apple|cpu]
# =============================================================================
set -euo pipefail

VAULT_DIR="${VAULT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PLATFORM="${1:-auto}"
if [[ "$PLATFORM" == --platform ]]; then PLATFORM="${2:-auto}"; fi

log()  { echo "▶  $*"; }
ok()   { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo "❌ $*"; }

# ── 1. Auto-detect platform ───────────────────────────────────────────────
if [[ "$PLATFORM" == "auto" ]]; then
    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
        PLATFORM="nvidia"
    elif command -v rocm-smi &>/dev/null; then
        PLATFORM="amd"
    elif [[ "$(uname -m)" == "arm64" && "$(uname -s)" == "Darwin" ]]; then
        PLATFORM="apple"
    else
        PLATFORM="cpu"
    fi
    log "Auto-detected platform: $PLATFORM"
fi

# ── 2. Kill stale processes ───────────────────────────────────────────────
log "Stopping stale inference processes..."
pkill -f "ollama serve"       2>/dev/null || true
pkill -f "llama-server"       2>/dev/null || true
pkill -f "whisper_server"     2>/dev/null || true
pkill -f "atlantean_backend"  2>/dev/null || true
sleep 1
ok "Stale processes cleared"

# ── 3. Platform-specific driver / runtime checks ─────────────────────────
case "$PLATFORM" in

  nvidia)
    log "Checking NVIDIA environment..."
    if ! nvidia-smi &>/dev/null; then
        warn "nvidia-smi failed — trying driver reload"
        sudo modprobe -r nvidia_uvm nvidia_drm nvidia_modeset nvidia &>/dev/null || true
        sleep 2
        sudo modprobe nvidia nvidia_modeset nvidia_drm nvidia_uvm &>/dev/null || true
        if nvidia-smi &>/dev/null; then ok "NVIDIA driver reloaded"; else fail "NVIDIA driver still broken — reboot may be needed"; fi
    else
        ok "NVIDIA driver OK: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)"
    fi
    # Check CUDA libraries
    if ldconfig -p 2>/dev/null | grep -q libcuda; then
        ok "CUDA runtime library found"
    else
        warn "libcuda.so not in ldconfig cache — run: sudo ldconfig"
        sudo ldconfig 2>/dev/null || true
    fi
    # Reinstall llama.cpp CUDA build if needed
    if [[ ! -x "$VAULT_DIR/backends/llama-server" ]]; then
        log "Reinstalling llama.cpp CUDA build..."
        bash "$VAULT_DIR/scripts/install_backend.sh" --backend llamacpp --accel cuda
    fi
    ;;

  amd)
    log "Checking AMD ROCm environment..."
    if ! rocm-smi &>/dev/null; then
        warn "rocm-smi not found or failed"
        if command -v apt-get &>/dev/null; then
            warn "Install ROCm: https://rocm.docs.amd.com/en/latest/deploy/linux/os-native/install.html"
        fi
    else
        ok "ROCm OK: $(rocm-smi --showdriver 2>/dev/null | head -1)"
    fi
    if [[ ! -x "$VAULT_DIR/backends/llama-server" ]]; then
        log "Reinstalling llama.cpp ROCm build..."
        bash "$VAULT_DIR/scripts/install_backend.sh" --backend llamacpp --accel rocm
    fi
    ;;

  apple)
    log "Checking Apple Silicon / Metal environment..."
    if [[ "$(uname -m)" != "arm64" ]]; then
        warn "Not running on ARM — Metal acceleration unavailable"
    else
        ok "Apple Silicon detected: $(sysctl -n machdep.cpu.brand_string)"
        # Ensure llama.cpp Metal build
        if [[ ! -x "$VAULT_DIR/backends/llama-server" ]]; then
            log "Installing llama.cpp Metal build..."
            bash "$VAULT_DIR/scripts/install_backend.sh" --backend llamacpp --accel metal
        fi
    fi
    ;;

  intel)
    log "Checking Intel GPU / NPU environment..."
    if command -v vainfo &>/dev/null; then
        ok "VA-API available: $(vainfo 2>/dev/null | head -1)"
    else
        warn "vainfo not found — install: sudo apt install vainfo intel-media-va-driver"
    fi
    if python3 -c "from openvino.runtime import Core; c=Core(); print(c.available_devices)" 2>/dev/null; then
        ok "OpenVINO available"
    else
        warn "OpenVINO not installed — install: pip install openvino"
    fi
    ;;

  cpu)
    log "CPU-only mode — no GPU acceleration"
    ok "CPU inference is always available"
    ;;

  *)
    warn "Unknown platform: $PLATFORM"
    ;;
esac

# ── 4. Verify Ollama ──────────────────────────────────────────────────────
log "Checking Ollama..."
if command -v ollama &>/dev/null; then
    ok "Ollama found: $(ollama --version 2>/dev/null | head -1)"
    # Start ollama to verify it launches
    timeout 5 ollama list &>/dev/null && ok "Ollama responds" || {
        warn "Ollama list timed out — starting daemon..."
        nohup ollama serve &>/tmp/ollama-recovery.log &
        sleep 3
        timeout 3 ollama list &>/dev/null && ok "Ollama started" || warn "Ollama still unresponsive — check /tmp/ollama-recovery.log"
    }
else
    warn "Ollama not installed. Run: bash scripts/install_backend.sh --backend ollama"
fi

# ── 5. Verify Python backend deps ─────────────────────────────────────────
log "Checking Python environment..."
if [[ -x "$VAULT_DIR/.venv/bin/python3" ]]; then
    PY="$VAULT_DIR/.venv/bin/python3"
else
    PY="python3"
fi
"$PY" -c "import flask, redis, torch" 2>/dev/null && ok "Core Python deps OK" || {
    warn "Missing Python deps — reinstalling..."
    "$VAULT_DIR/.venv/bin/pip" install --quiet -r "$VAULT_DIR/requirements.txt" 2>/dev/null || \
        pip3 install --quiet -r "$VAULT_DIR/requirements.txt"
}

# ── 6. Start Atlantean backend ────────────────────────────────────────────
log "Starting Atlantean backend..."
cd "$VAULT_DIR"
if curl -fsS "http://127.0.0.1:5001/health" &>/dev/null; then
    ok "Backend already healthy"
else
    nohup "$PY" atlantean_backend.py &>/tmp/atlantean-recovery.log &
    BACKEND_PID=$!
    sleep 4
    if curl -fsS "http://127.0.0.1:5001/health" &>/dev/null; then
        ok "Backend started (PID $BACKEND_PID)"
    else
        fail "Backend failed to start — check /tmp/atlantean-recovery.log"
        tail -20 /tmp/atlantean-recovery.log
        exit 1
    fi
fi

# ── 7. Deep health check ──────────────────────────────────────────────────
DEEP="$(curl -fsS http://127.0.0.1:5001/health/deep 2>/dev/null || echo '{}')"
echo "$DEEP" | python3 -c "
import json,sys
d=json.load(sys.stdin)
checks=d.get('checks',{})
for k,v in checks.items():
    icon='✅' if v in ('ok','enabled','disabled') else '⚠️ '
    print(f'  {icon}  {k}: {v}')
" 2>/dev/null || echo "  (could not parse deep health)"

echo ""
ok "Platform recovery complete for: $PLATFORM"
