#!/usr/bin/env bash
# Quadra-Seer stack launcher — one stack, two homes.
#
#   ./scripts/stack.sh local up|down|logs|status|smoke   # on your own machine
#   ./scripts/stack.sh vps   up|down|logs|status|smoke   # on a VPS (behind TLS proxy)
#
# First `up` generates .env.local / .env.vps with fresh random secrets
# (see .env.deploy.example). Ollama must be running on the host; the backend
# reaches it via host.docker.internal:11434. Requires Docker Compose >= 2.24.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-}"
ACTION="${2:-up}"
case "$MODE" in
  local) COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.local.yml); ENV_FILE=.env.local ;;
  vps)   COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml);  ENV_FILE=.env.vps ;;
  *) echo "usage: $0 local|vps [up|down|logs|status|smoke]" >&2; exit 2 ;;
esac

command -v docker >/dev/null || { echo "docker not found — install Docker first (see DEPLOYMENT.md)" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose v2 not found" >&2; exit 1; }

gen_secret() { python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32; }

ensure_env() {
  [ -f "$ENV_FILE" ] && return 0
  echo "Generating $ENV_FILE with fresh random secrets (kept on this machine only)."
  local token session
  token="$(gen_secret)"; session="$(gen_secret)"
  {
    echo "ATLANTEAN_API_TOKEN=$token"
    echo "VITE_API_TOKEN=$token"
    echo "ATLANTEAN_SESSION_SECRET=$session"
    if [ "$MODE" = vps ]; then echo "SEER_DOMAIN=seer.example.com"; fi
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  if [ "$MODE" = vps ]; then echo "NOTE: edit SEER_DOMAIN in $ENV_FILE to your real hostname before exposing the site."; fi
}

compose() { docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" "$@"; }

wait_healthy() {
  local url="http://127.0.0.1:5000/health" i
  for i in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then echo "Stack healthy: $url"; return 0; fi
    sleep 5
  done
  echo "Timed out waiting for $url — recent logs:" >&2
  compose logs --tail 40 backend frontend >&2 || true
  return 1
}

case "$ACTION" in
  up)
    ensure_env
    compose up -d --build
    wait_healthy
    echo "Quadra-Seer ($MODE) is up: http://127.0.0.1:5000"
    if [ "$MODE" = local ]; then echo "Tip: Ollama runs on the host — 'ollama serve' + 'ollama pull llama3.1:8b-instruct-q4_K_M'."; fi
    if [ "$MODE" = vps ]; then echo "Next: point your TLS reverse proxy (Caddy/nginx) at 127.0.0.1:5000 — see DEPLOYMENT.md."; fi
    ;;
  down)   compose down ;;
  logs)   compose logs -f --tail 100 ;;
  status) compose ps ;;
  smoke)
    echo "GET /health via frontend proxy:"
    curl -fsS http://127.0.0.1:5000/health && echo
    echo "Frontend title:"
    curl -fsS http://127.0.0.1:5000/ | grep -o "<title>[^<]*</title>" | head -1 || true
    ;;
  *) echo "unknown action: $ACTION (use up|down|logs|status|smoke)" >&2; exit 2 ;;
esac
