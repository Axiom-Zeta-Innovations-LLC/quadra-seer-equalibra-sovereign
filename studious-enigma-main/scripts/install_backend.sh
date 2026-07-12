#!/usr/bin/env bash
# =============================================================================
# install_backend.sh — Download and install a local inference backend binary.
#
# Usage:
#   bash scripts/install_backend.sh --backend ollama
#   bash scripts/install_backend.sh --backend llamacpp [--accel cuda|rocm|metal|cpu]
#
# Delegates to atlantean_core/backend_installer.py for platform detection,
# checksum verification and binary extraction.
# =============================================================================
set -euo pipefail

VAULT_DIR="${VAULT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKEND=""
ACCEL=""

# Parse args
while [[ $# -gt 0 ]]; do
    case "$1" in
        --backend)  BACKEND="$2"; shift 2 ;;
        --accel)    ACCEL="$2";   shift 2 ;;
        *)          echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [[ -z "$BACKEND" ]]; then
    echo "Usage: $0 --backend ollama|llamacpp [--accel cuda|rocm|metal|cpu]"
    exit 1
fi

log()  { echo "▶  $*"; }
ok()   { echo "✅ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# Resolve Python binary
if [[ -x "$VAULT_DIR/.venv/bin/python3" ]]; then
    PY="$VAULT_DIR/.venv/bin/python3"
else
    PY="python3"
fi

cd "$VAULT_DIR"

case "$BACKEND" in
  ollama)
    log "Installing Ollama..."
    "$PY" - <<'PYEOF'
import sys
sys.path.insert(0, '.')
from atlantean_core.backend_installer import install_ollama

def progress(msg):
    print(f"  {msg}")

result = install_ollama(on_progress=progress)
if result.get('already_installed'):
    print(f"✅ Ollama already installed: {result.get('path')}")
elif result.get('success'):
    print(f"✅ Ollama installed: {result.get('path')}")
else:
    print(f"❌ Ollama install failed: {result.get('error', result.get('stderr'))}")
    sys.exit(1)
PYEOF
    ;;

  llamacpp|llama.cpp)
    log "Installing llama.cpp server binary (accel=${ACCEL:-auto})..."
    PLATFORM_KEY=""
    if [[ -n "$ACCEL" ]]; then
        OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
        PLATFORM_KEY="${OS}-${ACCEL}"
    fi

    "$PY" - "$PLATFORM_KEY" <<'PYEOF'
import sys
sys.path.insert(0, '.')
from atlantean_core.backend_installer import install_llamacpp, detect_platform_key
from atlantean_core.hardware_probe import full_probe

platform_key = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None

def progress(msg):
    print(f"  {msg}")

probe = full_probe()
result = install_llamacpp(
    platform_key=platform_key,
    on_progress=progress,
    gpus=probe.get('gpus', []),
)
if result.get('already_installed'):
    print(f"✅ llama.cpp already installed: {result.get('path')}")
elif result.get('success'):
    print(f"✅ llama.cpp installed: {result.get('path')}")
    print(f"   Platform: {result.get('platform_key')}")
else:
    print(f"❌ llama.cpp install failed: {result.get('error')}")
    sys.exit(1)
PYEOF
    ;;

  *)
    fail "Unknown backend: $BACKEND. Use 'ollama' or 'llamacpp'."
    ;;
esac
