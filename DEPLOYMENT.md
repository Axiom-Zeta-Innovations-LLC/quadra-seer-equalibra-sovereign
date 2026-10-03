# Deploying Quadra-Seer — on your machine or on a VPS

One Docker Compose stack, two homes. The base `docker-compose.yml` defines the
services (frontend nginx → backend → Redis); two small override files adapt it:

| Mode | Override | Posture |
| --- | --- | --- |
| On your machine | `docker-compose.local.yml` | Every port bound to `127.0.0.1` only — nothing reachable from your LAN |
| VPS | `docker-compose.prod.yml` | Only the frontend is published, on host loopback, behind your TLS reverse proxy; backend + Redis are network-internal; secure cookies on |

`./scripts/stack.sh local|vps up|down|logs|status|smoke` wraps both. First
`up` generates `.env.local` / `.env.vps` with fresh random secrets (never
commit them; see `.env.deploy.example`).

## Prerequisites

- Docker Engine + Compose v2 ≥ 2.24 (Docker Desktop is fine on Mac/Windows)
- [Ollama](https://ollama.com) running on the **host** (the backend reaches it
  at `host.docker.internal:11434`):
  `ollama serve` and `ollama pull llama3.1:8b-instruct-q4_K_M`
- ~6 GB RAM headroom for the backend container (limit is set in compose)

## Option A — run it on your machine

```bash
git clone <this repo> && cd quadra-seer-equalibra-sovereign
ollama serve &                      # in another terminal
ollama pull llama3.1:8b-instruct-q4_K_M
./scripts/stack.sh local up         # builds, starts, waits for /health
```

Open http://127.0.0.1:5000. Stop with `./scripts/stack.sh local down`.

## Option B — run it on a VPS

1. Install Docker Engine on the VPS, clone this repo.
2. Set your hostname: `./scripts/stack.sh vps up` once to generate `.env.vps`,
   then edit `SEER_DOMAIN=your.domain` in it (and stop the stack:
   `./scripts/stack.sh vps down`).
3. Terminate TLS on the host with Caddy (simplest — automatic HTTPS):

   ```
   your.domain {
       reverse_proxy 127.0.0.1:5000
   }
   ```

   (nginx equivalent: `proxy_pass http://127.0.0.1:5000;` with your cert setup.)
4. `./scripts/stack.sh vps up`
5. Firewall: expose only 22/80/443. Port 5000 stays loopback; 5001/6379 are
   never published.

Updates: `git pull && ./scripts/stack.sh vps up` (rebuilds + restarts).
Rollback: check out the previous commit and run the same command.

## Backups

State lives in named volumes: `vault_data` (journal, vector index),
`redis_data`, `piper_voices_data`.

```bash
docker run --rm -v quadra-seer-equalibra-sovereign_vault_data:/v -v "$PWD":/b alpine \
  tar czf /b/vault-backup.tgz -C /v .
```

(Compose prefixes volume names with the project directory name — confirm with
`docker volume ls`.)

## First-run smoke checklist

1. `./scripts/stack.sh <mode> smoke` — `/health` answers through the proxy and
   the frontend serves its title.
2. Open the UI; the app should load without API 401s (the frontend token is
   baked at build time from `VITE_API_TOKEN` — if you rotate the token in
   `.env.*`, rerun `up` so the frontend rebuilds).
3. Ask a question in chat and confirm Ollama answers (backend log shows the
   local LLM call). If chat fails, check `ollama serve` is up on the host.
4. Voice: whisper STT downloads its model on first use — with
   `ALLOW_OUTBOUND_NETWORK=0` (default) that download is blocked, so either
   allow outbound once or pre-seed the model. Piper TTS needs the voice files
   (`en_US-lessac-medium.onnx` + `.json`) in the `piper_voices_data` volume.

## Security notes

- Sovereignty defaults stay on in both modes: outbound network and cloud
  escalation are off unless you explicitly enable them.
- The API token is visible to anyone who can read the frontend bundle (it is a
  client-side credential by design). Loopback/TLS + the token together are the
  access control — do not expose port 5000 directly to the internet.
- No license is granted for this software (all rights reserved).
