#!/usr/bin/env bash
# =============================================================================
# install_vault.sh — Reproducible Vault runtime installer.
#
# Installs:
#   - Python venv with all dependencies
#   - Ollama (if not present) + pulls the hardware-appropriate model
#   - Piper voice model
#   - Generates secrets and systemd units
#   - Runs the acceptance test suite
#
# Usage (as root or a user with sudo):
#   bash scripts/install_vault.sh [--tier small_quantized|medium|multi_agent]
#   bash scripts/install_vault.sh --tier medium --voice en_US-lessac-medium
# =============================================================================
set -euo pipefail

VAULT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TIER="${TIER:-medium}"
VOICE="${VOICE:-en_US-lessac-medium}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="$VAULT_DIR/.venv"

# Parse flags
while [[ $# -gt 0 ]]; do
    case "$1" in
        --tier)   TIER="$2"; shift 2 ;;
        --voice)  VOICE="$2"; shift 2 ;;
        *)        echo "Unknown arg: $1"; exit 1 ;;
    esac
done

log()  { echo "▶  $*"; }
ok()   { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

echo "============================================================"
echo "  Atlantean Vault Installer"
echo "  Tier   : $TIER"
echo "  Voice  : $VOICE"
echo "  Dir    : $VAULT_DIR"
echo "============================================================"

# ── 1. Python venv ───────────────────────────────────────────────────────────
log "Creating Python venv..."
if [[ ! -d "$VENV_DIR" ]]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
PY="$VENV_DIR/bin/python3"
PIP="$VENV_DIR/bin/pip"

log "Installing Python dependencies..."
"$PIP" install --quiet --upgrade pip
# Install base deps first (torch separately for CPU wheels)
grep -v '^torch==' "$VAULT_DIR/requirements.txt" > /tmp/vault_reqs_no_torch.txt
"$PIP" install --quiet -r /tmp/vault_reqs_no_torch.txt
"$PIP" install --quiet \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.2.0
ok "Python deps installed"

# ── 2. Ollama ────────────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
    log "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    ok "Ollama installed"
else
    ok "Ollama already present: $(ollama --version 2>/dev/null || echo 'unknown')"
fi

# Map tier to model
case "$TIER" in
    small_quantized) MODEL="llama3.2:3b-instruct-q4_K_M";;
    multi_agent)     MODEL="llama3.1:70b-instruct-q4_K_M"; warn "multi_agent tier requires ~40 GB RAM";;
    *)               MODEL="llama3.1:8b-instruct-q4_K_M"; TIER="medium";;
esac

log "Starting Ollama daemon (background)..."
if ! pgrep -f "ollama serve" &>/dev/null; then
    nohup ollama serve &>/tmp/ollama-serve.log &
    sleep 4
fi

log "Pulling model: $MODEL"
ollama pull "$MODEL"
ok "Model ready: $MODEL"

# ── 3. Voice pipeline ────────────────────────────────────────────────────────
log "Running local voice setup..."
bash "$VAULT_DIR/scripts/setup_local_voice.sh" --tier "$TIER"

# Generate model checksums after install
log "Generating model checksums..."
"$PY" -m atlantean_core.model_integrity --generate "$VAULT_DIR/voices" \
    --out "$VAULT_DIR/model_checksums.json" 2>/dev/null || \
    "$PY" -c "
import sys; sys.path.insert(0, '$VAULT_DIR')
from atlantean_core.model_integrity import save_checksums
save_checksums('$VAULT_DIR/model_checksums.json', '$VAULT_DIR/voices')
" && ok "Checksums saved: model_checksums.json"

# ── 4. Secrets ────────────────────────────────────────────────────────────────
if [[ ! -f "$VAULT_DIR/.env.local" ]]; then
    log "Generating secrets → .env.local"
    bash "$VAULT_DIR/scripts/vault_secrets.sh" > "$VAULT_DIR/.env.local"
    chmod 600 "$VAULT_DIR/.env.local"
    # Append hardware/voice config
    cat >> "$VAULT_DIR/.env.local" <<EOF

# Hardware tier
ATLANTEAN_HARDWARE_TIER=${TIER}
LOCAL_LLM_MODEL=${MODEL}
LOCAL_LLM_BACKEND=ollama
LOCAL_LLM_URL=http://127.0.0.1:11434/api/generate

# Voice
ATLANTEAN_WHISPER_MODEL=base
ATLANTEAN_WHISPER_DEVICE=cpu
ATLANTEAN_WHISPER_COMPUTE_TYPE=int8
ATLANTEAN_PIPER_VOICE=${VOICE}
ATLANTEAN_PIPER_VOICE_DIR=./voices
EOF
    ok "Secrets written to .env.local"
else
    warn ".env.local already exists — skipping secret generation"
fi

# ── 5. Systemd units (optional) ──────────────────────────────────────────────
if command -v systemctl &>/dev/null && [[ "$(id -u)" -eq 0 ]]; then
    log "Installing systemd units..."
    cp "$VAULT_DIR/ops/systemd/atlantean-backend.service" /etc/systemd/system/
    cp "$VAULT_DIR/ops/systemd/ollama-vault.service" /etc/systemd/system/
    # Create vault user
    id vault &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin vault

    mkdir -p /etc/vault /opt/vault
    cp "$VAULT_DIR/.env.local" /etc/vault/atlantean.env
    chmod 600 /etc/vault/atlantean.env
    chown vault:vault /etc/vault/atlantean.env

    # Update WorkingDirectory in unit file
    sed -i "s|/opt/vault/studious-enigma-main|$VAULT_DIR|g" \
        /etc/systemd/system/atlantean-backend.service
    sed -i "s|/opt/vault/venv|$VENV_DIR|g" \
        /etc/systemd/system/atlantean-backend.service

    systemctl daemon-reload
    systemctl enable atlantean-backend ollama-vault
    ok "systemd units installed and enabled"
else
    log "Skipping systemd (not root or systemd not available)"
fi

# ── 6. UFW firewall ──────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    log "Applying UFW egress rules (review ops/firewall/ufw-sovereign-egress.sh first)..."
    warn "Run 'bash ops/firewall/ufw-sovereign-egress.sh' manually after reviewing."
fi

# ── 7. Acceptance tests ──────────────────────────────────────────────────────
log "Running acceptance tests..."
"$PY" "$VAULT_DIR/benchmarks/vault_acceptance.py" \
    --backend-url "http://127.0.0.1:${ATLANTEAN_PORT:-5001}" || {
    warn "Some acceptance tests failed. Review output above."
}

echo ""
echo "============================================================"
ok "Vault installation complete!"
echo ""
echo "  To start (local mode):  bash start.sh local"
echo "  To start (Docker):      bash start.sh docker"
echo ""
echo "  API token is in .env.local (ATLANTEAN_API_TOKEN)."
echo "  Set the same value as VITE_API_TOKEN in your frontend .env.local."
echo ""
echo "  IMPORTANT: Revoke any previously exposed cloud API keys."
echo "============================================================"
