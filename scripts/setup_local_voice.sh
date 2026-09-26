#!/usr/bin/env bash
# =============================================================================
# setup_local_voice.sh — Install Ollama, pull the recommended model, install
# Piper TTS, and download a voice model.
#
# Usage:
#   bash scripts/setup_local_voice.sh [--tier small_quantized|medium|multi_agent]
#
# Defaults:
#   --tier medium  (RTX 3060 / M1-Pro class hardware)
#
# Set the VOICE env var to override the Piper voice:
#   VOICE=en_US-amy-medium bash scripts/setup_local_voice.sh
# =============================================================================
set -euo pipefail

TIER="${1:-}"
if [[ "$TIER" == --tier ]]; then TIER="${2:-medium}"; fi
if [[ -z "$TIER" ]]; then TIER="medium"; fi

VOICE="${VOICE:-en_US-lessac-medium}"
VOICE_DIR="${PIPER_VOICE_DIR:-./voices}"
PIPER_RELEASE_BASE="https://github.com/rhasspy/piper/releases/download/2023.11.14-2"

# Detect OS and arch
OS="$(uname -s)"
ARCH="$(uname -m)"

log() { echo "▶  $*"; }
ok()  { echo "✅ $*"; }
warn(){ echo "⚠️  $*"; }

# =============================================================================
# 1. Ollama
# =============================================================================
install_ollama() {
    if command -v ollama &>/dev/null; then
        ok "Ollama already installed: $(ollama --version 2>/dev/null || echo 'unknown version')"
        return
    fi
    log "Installing Ollama..."
    if [[ "$OS" == "Darwin" ]]; then
        if command -v brew &>/dev/null; then
            brew install ollama
        else
            curl -fsSL https://ollama.com/install.sh | sh
        fi
    elif [[ "$OS" == "Linux" ]]; then
        curl -fsSL https://ollama.com/install.sh | sh
    else
        warn "Unsupported OS for automatic Ollama install. Download from https://ollama.com"
        return
    fi
    ok "Ollama installed"
}

# =============================================================================
# 2. Pull the right model for the selected tier
# =============================================================================
pull_model() {
    local model=""
    case "$TIER" in
        small_quantized)
            model="llama3.2:3b-instruct-q4_K_M"
            ;;
        medium)
            model="llama3.1:8b-instruct-q4_K_M"
            ;;
        multi_agent)
            model="llama3.1:70b-instruct-q4_K_M"
            warn "multi_agent tier: this model requires ~40 GB RAM. Ensure you have enough VRAM/RAM."
            ;;
        *)
            warn "Unknown tier '$TIER'. Using medium default."
            model="llama3.1:8b-instruct-q4_K_M"
            ;;
    esac

    log "Starting Ollama server (background)..."
    if ! pgrep -f "ollama serve" &>/dev/null; then
        ollama serve &>/tmp/ollama-serve.log &
        sleep 3
    fi

    log "Pulling model: $model"
    ollama pull "$model"
    ok "Model pulled: $model"

    cat <<EOF

Set in .env.local to use this model:
  LOCAL_LLM_BACKEND=ollama
  LOCAL_LLM_MODEL=$model
  LOCAL_LLM_URL=http://127.0.0.1:11434/api/generate
  ATLANTEAN_HARDWARE_TIER=$TIER

EOF
}

# =============================================================================
# 3. Install faster-whisper
# =============================================================================
install_whisper() {
    log "Installing faster-whisper..."
    if python3 -c "import faster_whisper" &>/dev/null 2>&1; then
        ok "faster-whisper already installed"
        return
    fi
    pip install --quiet "faster-whisper>=1.0.3"
    ok "faster-whisper installed"
}

# =============================================================================
# 4. Install piper-tts Python package
# =============================================================================
install_piper_package() {
    log "Installing piper-tts Python package..."
    if python3 -c "import piper" &>/dev/null 2>&1; then
        ok "piper-tts already installed"
        return
    fi
    pip install --quiet "piper-tts>=1.2.0"
    ok "piper-tts installed"
}

# =============================================================================
# 5. Download Piper voice model
# =============================================================================
download_voice_model() {
    mkdir -p "$VOICE_DIR"
    local onnx_file="$VOICE_DIR/${VOICE}.onnx"
    local cfg_file="$VOICE_DIR/${VOICE}.onnx.json"

    if [[ -f "$onnx_file" && -f "$cfg_file" ]]; then
        ok "Voice model already present: $onnx_file"
        return
    fi

    log "Downloading Piper voice: $VOICE"

    # Map voice name to Piper release filename convention:
    # e.g. en_US-lessac-medium → en-us-lessac-medium
    local release_name="${VOICE//_/-}"
    # Remove the country code double-underscore: en_US -> en-us
    release_name="$(echo "$release_name" | sed 's/\([a-z][a-z]\)-\([A-Z][A-Z]\)/\1-\L\2/')"

    local onnx_url="${PIPER_RELEASE_BASE}/voice-${release_name}.onnx"
    local cfg_url="${PIPER_RELEASE_BASE}/voice-${release_name}.onnx.json"

    # Attempt download
    if curl -fsSL "$onnx_url" -o "$onnx_file"; then
        ok "Downloaded: $onnx_file"
    else
        warn "Failed to auto-download voice model."
        echo ""
        echo "  Manual download steps:"
        echo "  1. Browse: https://github.com/rhasspy/piper/releases"
        echo "  2. Download the .onnx and .onnx.json files for voice '$VOICE'"
        echo "  3. Place them in: $VOICE_DIR/"
        rm -f "$onnx_file"
        return
    fi

    if curl -fsSL "$cfg_url" -o "$cfg_file"; then
        ok "Downloaded: $cfg_file"
    else
        warn "Config JSON download failed — synthesis may use defaults."
        rm -f "$cfg_file"
    fi

    cat <<EOF

Voice model ready. Set in .env.local:
  ATLANTEAN_PIPER_VOICE=$VOICE
  ATLANTEAN_PIPER_VOICE_DIR=$VOICE_DIR

EOF
}

# =============================================================================
# Main
# =============================================================================
echo "============================================================"
echo "  Quadra-Seer Local Voice Setup"
echo "  Hardware tier : $TIER"
echo "  Piper voice   : $VOICE"
echo "  Voice dir     : $VOICE_DIR"
echo "============================================================"
echo ""

install_ollama
pull_model
install_whisper
install_piper_package
download_voice_model

echo ""
echo "============================================================"
ok "Local voice stack setup complete!"
echo ""
echo "  LLM inference  : ollama (http://127.0.0.1:11434)"
echo "  Transcription  : faster-whisper   (POST /api/atlantean/transcribe)"
echo "  TTS            : Piper            (POST /api/atlantean/tts)"
echo ""
echo "  Next steps:"
echo "  1. Copy .env.example to .env.local and fill in the values above."
echo "  2. Run: bash start.sh"
echo "  3. Open the app and verify the mic button uses local STT."
echo "============================================================"
