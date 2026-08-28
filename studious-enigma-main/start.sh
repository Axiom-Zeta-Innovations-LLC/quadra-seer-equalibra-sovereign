#!/bin/bash

# Start Everything Script for Studious Enigma
# Starts full stack via docker compose by default.
# Use "./start.sh local" to run the legacy local process mode.

set -euo pipefail

MODE="${1:-docker}"

run_compose() {
    echo "🚀 Starting full stack with docker compose (frontend + backend + redis)"
    if docker compose version >/dev/null 2>&1; then
        exec docker compose up --build
    elif command -v docker-compose >/dev/null 2>&1; then
        exec docker-compose up --build
    else
        echo "❌ Docker Compose not found. Install Docker Desktop/Compose or run './start.sh local'."
        exit 1
    fi
}

if [[ "${MODE}" == "docker" || "${MODE}" == "--docker" ]]; then
    run_compose
fi

if [[ "${MODE}" != "local" && "${MODE}" != "--local" ]]; then
    echo "Usage: ./start.sh [docker|local]"
    exit 1
fi

# Resolve port from env, then .env.local, then default.
[[ -f ".env.local" ]] && source <(grep -E '^ATLANTEAN_PORT=' .env.local) 2>/dev/null || true
ATLANTEAN_PORT="${ATLANTEAN_PORT:-5001}"
PY_BACKEND_PORT="$ATLANTEAN_PORT"
PY_BACKEND_URL="http://127.0.0.1:${PY_BACKEND_PORT}"
HEALTH_URL="${PY_BACKEND_URL}/health"
NODE_API_PORT="${NODE_API_PORT:-5000}"
START_NODE_API="${START_NODE_API:-0}"

if [[ -x ".venv/bin/python3" ]]; then
    PYTHON_BIN=".venv/bin/python3"
else
    PYTHON_BIN="python3"
fi

PY_BACKEND_PID=""
NODE_API_PID=""

cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    if [[ -n "${NODE_API_PID}" ]] && kill -0 "${NODE_API_PID}" 2>/dev/null; then
        kill "${NODE_API_PID}" 2>/dev/null || true
        wait "${NODE_API_PID}" 2>/dev/null || true
        echo "✅ Node API stopped"
    fi
    if [[ -n "${PY_BACKEND_PID}" ]] && kill -0 "${PY_BACKEND_PID}" 2>/dev/null; then
        kill "${PY_BACKEND_PID}" 2>/dev/null || true
        wait "${PY_BACKEND_PID}" 2>/dev/null || true
        echo "✅ Python backend stopped"
    fi
}

trap cleanup EXIT INT TERM

echo "🚀 Starting Studious Enigma - Python Core + Node API + Frontend"

# Check if Redis container is running (best effort)
if command -v docker >/dev/null 2>&1; then
    if ! docker ps --format '{{.Names}}' | grep -qx 'redis-atlantean'; then
        if docker ps -a --format '{{.Names}}' | grep -qx 'redis-atlantean'; then
            echo "📦 Starting existing Redis container redis-atlantean..."
            docker start redis-atlantean >/dev/null
        else
            echo "📦 Creating Redis container redis-atlantean..."
            docker run -d --name redis-atlantean -p 6379:6379 redis:7-alpine >/dev/null
        fi
    else
        echo "✅ Redis container already running"
    fi
else
    echo "⚠️  Docker not found; skipping Redis auto-start"
fi

echo ""
echo "🐍 Starting Atlantean backend on port ${PY_BACKEND_PORT}..."
"${PYTHON_BIN}" atlantean_backend.py &
PY_BACKEND_PID=$!

echo "⏳ Waiting for backend health at ${HEALTH_URL} ..."
for i in $(seq 1 60); do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
        # Liveness confirmed — check subsystem status and warn on missing Ollama.
        _deep=$(curl -fsS "${PY_BACKEND_URL}/health/deep" 2>/dev/null || echo '{}')
        if echo "$_deep" | grep -q '"ollama":"unavailable"'; then
            echo "⚠️  Backend up (PID: ${PY_BACKEND_PID}) — Ollama unavailable. Start Ollama and pull a model before chatting."
        else
            echo "✅ Atlantean backend is healthy (PID: ${PY_BACKEND_PID})"
        fi
        break
    fi
    if ! kill -0 "${PY_BACKEND_PID}" 2>/dev/null; then
        echo "❌ Atlantean backend exited before becoming healthy"
        exit 1
    fi
    sleep 1
    if [[ "${i}" == "60" ]]; then
        echo "❌ Atlantean backend health check timed out"
        exit 1
    fi
done

if [[ "${START_NODE_API}" == "1" ]]; then
    echo ""
    echo "🟦 Starting Node API (server.js) on port ${NODE_API_PORT}..."
    NODE_API_PORT="${NODE_API_PORT}" npm start &
    NODE_API_PID=$!
    echo "✅ Node API launched (PID: ${NODE_API_PID})"
else
    echo "ℹ️  Skipping Node API startup (START_NODE_API=${START_NODE_API})"
fi

echo ""
echo "🌐 Starting frontend (Vite)..."
echo ""
echo "=================================================="
echo "  READY"
echo "=================================================="
echo "  Atlantean Backend: ${PY_BACKEND_URL}"
echo "  Node API:          http://127.0.0.1:3001"
echo "  Frontend UI:       http://127.0.0.1:5000"
echo "=================================================="
echo ""

# Keep frontend in foreground; trap handles backend cleanup on exit.
npm run dev