#!/bin/bash

# Phase 1 Integration Startup Script
# Starts full integration stack via docker compose by default.
# Use "./start_integration.sh local" for legacy local process mode.

set -euo pipefail

MODE="${1:-docker}"

run_compose() {
    echo "🚀 Starting integration stack with docker compose (frontend + backend + redis)"
    if docker compose version >/dev/null 2>&1; then
        exec docker compose up --build
    elif command -v docker-compose >/dev/null 2>&1; then
        exec docker-compose up --build
    else
        echo "❌ Docker Compose not found. Install Docker Desktop/Compose or run './start_integration.sh local'."
        exit 1
    fi
}

if [[ "${MODE}" == "docker" || "${MODE}" == "--docker" ]]; then
    run_compose
fi

if [[ "${MODE}" != "local" && "${MODE}" != "--local" ]]; then
    echo "Usage: ./start_integration.sh [docker|local]"
    exit 1
fi

echo "=================================================="
echo "  ATLANTEAN + QUADRA-SEER INTEGRATION"
echo "  Phase 1: Foundation"
echo "=================================================="
echo ""

if [[ -x ".venv/bin/python3" ]]; then
    PYTHON_BIN=".venv/bin/python3"
else
    PYTHON_BIN="python3"
fi

# Check if Python dependencies are installed
echo "📦 Checking Python dependencies..."
"${PYTHON_BIN}" -c "import torch, flask, flask_cors" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Installing Python dependencies..."
    pip install torch numpy scikit-learn cryptography flask flask-cors -q
    echo "✅ Python dependencies installed"
fi

# Check if Node dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    npm install
fi

echo ""
echo "🚀 Starting Atlantean Backend on port 5001..."
"${PYTHON_BIN}" atlantean_backend.py &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend is running
curl -s http://localhost:5001/health > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Atlantean Backend running (PID: $BACKEND_PID)"
else
    echo "❌ Atlantean Backend failed to start"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo "🌐 Starting Quadra-Seer Frontend..."
echo ""
echo "=================================================="
echo "  READY!"
echo "=================================================="
echo ""
echo "  Atlantean Backend:  http://localhost:5001"
echo "  Quadra-Seer UI:     http://localhost:3000"
echo ""
echo "  To stop: Press Ctrl+C"
echo ""
echo "=================================================="
echo ""

# Start frontend (this will run in foreground)
npm run dev

# When frontend stops, kill backend
echo ""
echo "🛑 Stopping Atlantean Backend..."
kill $BACKEND_PID 2>/dev/null
echo "✅ Shutdown complete"
