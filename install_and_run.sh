#!/usr/bin/env bash
# ============================================================
#  One-Click Installer & Launcher — Linux / macOS
#
#  Usage:
#    chmod +x install_and_run.sh && ./install_and_run.sh
#
#  Options:
#    --model <name>   Ollama model to use (default: llama3.2:3b-instruct-q4_K_M)
#    --reinstall      Force reinstall of Python deps
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEFAULT_MODEL="llama3.2:3b-instruct-q4_K_M"
MODEL="$DEFAULT_MODEL"
REINSTALL=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --model)    MODEL="$2"; shift 2 ;;
        --reinstall) REINSTALL=1; shift ;;
        -h|--help)
            echo "Usage: ./install_and_run.sh [--model <ollama-model>] [--reinstall]"
            echo "  --model     Ollama model tag  (default: $DEFAULT_MODEL)"
            echo "  --reinstall Re-install all Python/npm deps"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

log()  { echo ""; echo "▶  $*"; }
ok()   { echo "✅ $*"; }
warn() { echo "⚠️  $*"; }
fail() { echo ""; echo "❌ $*" >&2; exit 1; }

banner() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║       Atlantean — Local Ollama Installer             ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo "  Model : $MODEL"
    echo "  Dir   : $SCRIPT_DIR"
    echo ""
}

banner

# ── 1. Check Python ─────────────────────────────────────────────────────────
log "Checking Python..."
PYTHON_BIN=""
for candidate in python3.11 python3.10 python3.12 python3; do
    if command -v "$candidate" &>/dev/null; then
        ver=$("$candidate" -c "import sys; print(sys.version_info[:2])")
        # Require >= 3.10
        if "$candidate" -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
            PYTHON_BIN="$candidate"
            ok "Found Python: $candidate ($ver)"
            break
        fi
    fi
done
[[ -z "$PYTHON_BIN" ]] && fail "Python 3.10 or newer is required. Install from https://python.org"

# ── 2. Check Node.js ─────────────────────────────────────────────────────────
log "Checking Node.js..."
if ! command -v node &>/dev/null; then
    fail "Node.js 18+ is required. Install from https://nodejs.org"
fi
NODE_VER=$(node -e "process.stdout.write(process.version)")
ok "Found Node.js $NODE_VER"
if ! node -e "if(parseInt(process.version.slice(1))<18)process.exit(1)" 2>/dev/null; then
    fail "Node.js 18+ required (found $NODE_VER). Update from https://nodejs.org"
fi

# ── 3. Install / verify Ollama ───────────────────────────────────────────────
log "Checking Ollama..."
if ! command -v ollama &>/dev/null; then
    warn "Ollama not found — installing now..."
    if [[ "$(uname -s)" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            brew install ollama
        else
            warn "Homebrew not found. Downloading Ollama installer..."
            curl -fsSL https://ollama.com/install.sh | sh
        fi
    else
        curl -fsSL https://ollama.com/install.sh | sh
    fi
    ok "Ollama installed"
else
    ok "Ollama present: $(ollama --version 2>/dev/null || echo 'installed')"
fi

# ── 4. Start Ollama daemon ───────────────────────────────────────────────────
log "Starting Ollama service..."
if ! pgrep -f "ollama serve" &>/dev/null && ! pgrep -f "ollama runner" &>/dev/null; then
    nohup ollama serve > /tmp/ollama-serve.log 2>&1 &
    echo "  Waiting for Ollama to start..."
    for i in $(seq 1 20); do
        if curl -sf http://127.0.0.1:11434/ &>/dev/null; then
            ok "Ollama daemon running"
            break
        fi
        sleep 1
        if [[ "$i" == "20" ]]; then
            fail "Ollama daemon did not start. Check /tmp/ollama-serve.log"
        fi
    done
else
    ok "Ollama daemon already running"
fi

# ── 5. Pull model ────────────────────────────────────────────────────────────
log "Pulling model: $MODEL (this may take a few minutes on first run)..."
if ollama list 2>/dev/null | grep -q "^${MODEL}"; then
    ok "Model already downloaded: $MODEL"
else
    ollama pull "$MODEL"
    ok "Model ready: $MODEL"
fi

# ── 6. Python virtual environment ───────────────────────────────────────────
log "Setting up Python environment..."
VENV_DIR="$SCRIPT_DIR/.venv"

if [[ "$REINSTALL" == "1" && -d "$VENV_DIR" ]]; then
    rm -rf "$VENV_DIR"
    warn "Removed existing venv for reinstall"
fi

if [[ ! -d "$VENV_DIR" ]]; then
    "$PYTHON_BIN" -m venv "$VENV_DIR"
    ok "Created virtual environment"
fi

PY="$VENV_DIR/bin/python3"
PIP="$VENV_DIR/bin/pip"

if [[ "$REINSTALL" == "1" ]] || [[ ! -f "$VENV_DIR/.installed" ]]; then
    # Pick torch version: 2.2.0 has no Python 3.12 wheels; use 2.4.0+ for 3.12+
    PY_MINOR=$("$PY" -c "import sys; print(sys.version_info.minor)")
    TORCH_VER="torch==2.2.0"
    [[ "$PY_MINOR" -ge 12 ]] && TORCH_VER="torch==2.4.0"

    log "Installing Python dependencies ($TORCH_VER CPU - may take a few minutes)..."
    "$PIP" install --quiet --upgrade pip

    # Exclude torch and optional heavy voice deps from base requirements
    grep -v '^torch' "$SCRIPT_DIR/requirements.txt" | \
        grep -v '^faster-whisper' | grep -v '^piper-tts' \
        > /tmp/atlantean_reqs.txt || true

    "$PIP" install --quiet -r /tmp/atlantean_reqs.txt || \
        fail "pip failed installing base dependencies. Check output above."

    "$PIP" install --quiet \
        --index-url https://download.pytorch.org/whl/cpu \
        "$TORCH_VER" || fail "pip failed installing $TORCH_VER."

    # ── Sovereign Workspace optional deps ───────────────────────────────────
    # lancedb + sentence-transformers enable semantic file search.
    # Skipped automatically if the wheels fail (e.g. on old CPUs without AVX2).
    log "Installing Sovereign Workspace deps (lancedb, sentence-transformers)..."
    "$PIP" install --quiet \
        "lancedb>=0.5.0" \
        "sentence-transformers>=2.6.0" \
        "pyarrow>=14.0.0" \
        "watchdog>=4.0.0" \
        "pydantic>=2.0.0" \
        "pypdf>=3.0.0" \
        "pdfplumber>=0.10.0" \
        "python-docx>=1.0.0" \
        2>/dev/null \
        && ok "Sovereign Workspace deps installed (semantic search + automation)" \
        || warn "Sovereign Workspace deps could not be installed — semantic search will run in keyword-only mode."

    touch "$VENV_DIR/.installed"
    ok "Python dependencies installed ($TORCH_VER)"
else
    ok "Python dependencies already installed (use --reinstall to refresh)"
fi

# ── 7. Node.js dependencies ─────────────────────────────────────────────────
log "Installing Node.js dependencies..."
if [[ "$REINSTALL" == "1" ]] || [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
    npm install --silent
    ok "Node.js dependencies installed"
else
    ok "Node.js dependencies already installed"
fi

# ── 7b. Build frontend ───────────────────────────────────────────────────────
log "Building frontend..."
npm run build
ok "Frontend built"

# ── 8. Write .env.local ──────────────────────────────────────────────────────
log "Configuring environment..."
ENV_FILE="$SCRIPT_DIR/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
    # Generate a random session secret
    SESSION_SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48 2>/dev/null || \
                     "$PY" -c "import secrets; print(secrets.token_hex(24))")
    cat > "$ENV_FILE" <<EOF
# Auto-generated by install_and_run.sh — edit as needed

# Local Ollama inference (no cloud, no API key needed)
ATLANTEAN_LLM_PROVIDER=local
LOCAL_LLM_BACKEND=ollama
LOCAL_LLM_URL=http://127.0.0.1:11434/api/generate
LOCAL_LLM_MODEL=${MODEL}

# Session security
ATLANTEAN_SESSION_SECRET=${SESSION_SECRET}

# Disable cloud escalation (fully local)
ALLOW_CLOUD_ESCALATION=0
ALLOW_OUTBOUND_NETWORK=0

# Sovereign Workspace — local-first defaults
ATLANTEAN_ALLOW_BROWSER_SPEECH_FALLBACK=0
ATLANTEAN_REQUIRE_LOCAL_STT=1
ATLANTEAN_JOURNAL_DIR=./vault_data/journal
ATLANTEAN_VECTOR_DB_PATH=./vault_data/vector_index

# Hardware tier (options: small_quantized, medium, multi_agent)
ATLANTEAN_HARDWARE_TIER=medium

# Port
ATLANTEAN_PORT=5001
EOF
    chmod 600 "$ENV_FILE"
    ok ".env.local created"
else
    # Update the model in existing .env.local
    if grep -q "^LOCAL_LLM_MODEL=" "$ENV_FILE"; then
        sed -i.bak "s|^LOCAL_LLM_MODEL=.*|LOCAL_LLM_MODEL=${MODEL}|" "$ENV_FILE"
        rm -f "${ENV_FILE}.bak"
    fi
    ok ".env.local already exists"
fi

# ── 9. Start services ────────────────────────────────────────────────────────
# Resolve port from env, then .env.local, then default.
[[ -f "$SCRIPT_DIR/.env.local" ]] && source <(grep -E '^ATLANTEAN_PORT=' "$SCRIPT_DIR/.env.local") 2>/dev/null || true
ATLANTEAN_PORT="${ATLANTEAN_PORT:-5001}"
PY_BACKEND_PORT="$ATLANTEAN_PORT"
PY_BACKEND_PID=""
NODE_PID=""

cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    [[ -n "$NODE_PID" ]] && kill "$NODE_PID" 2>/dev/null || true
    [[ -n "$PY_BACKEND_PID" ]] && kill "$PY_BACKEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
    echo "👋 Stopped."
}
trap cleanup EXIT INT TERM

log "Starting Atlantean backend..."
"$PY" "$SCRIPT_DIR/atlantean_backend.py" &
PY_BACKEND_PID=$!

echo "  Waiting for backend to be healthy..."
for i in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${PY_BACKEND_PORT}/health" &>/dev/null; then
        # Liveness confirmed — check subsystem status and warn on missing Ollama.
        _deep=$(curl -fsS "http://127.0.0.1:${PY_BACKEND_PORT}/health/deep" 2>/dev/null || echo '{}')
        if echo "$_deep" | grep -q '"ollama":"unavailable"'; then
            warn "Backend up (PID: $PY_BACKEND_PID) — Ollama unavailable. Start Ollama and pull a model before chatting."
        else
            ok "Backend healthy (PID: $PY_BACKEND_PID)"
        fi
        break
    fi
    if ! kill -0 "$PY_BACKEND_PID" 2>/dev/null; then
        fail "Backend exited early. Check output above for errors."
    fi
    sleep 1
    [[ "$i" == "60" ]] && fail "Backend health-check timed out"
done

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                    READY                            ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Backend  →  http://127.0.0.1:${PY_BACKEND_PORT}             ║"
echo "║  Frontend →  http://127.0.0.1:5000  (opening now)   ║"
echo "║                                                      ║"
echo "║  Model    →  $MODEL"
echo "║  Press Ctrl+C to stop                               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Open browser (best-effort)
URL="http://127.0.0.1:5000"
if command -v xdg-open &>/dev/null; then
    (sleep 3 && xdg-open "$URL") &
elif command -v open &>/dev/null; then
    (sleep 3 && open "$URL") &
fi

# Serve built frontend in foreground
npm start
