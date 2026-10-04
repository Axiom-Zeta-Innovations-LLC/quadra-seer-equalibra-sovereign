# Quadra-Seer Sovereign — licensed bundle setup

You received a watermarked, licensed copy of Quadra-Seer Sovereign. This bundle
contains **built artifacts only** (compiled application, no source code).

## Prerequisites

- Docker Engine + Compose v2
- [Ollama](https://ollama.com) running on this machine: `ollama serve` + `ollama pull llama3.1:8b-instruct-q4_K_M`
- ~6 GB RAM headroom

## 1. Activate your license (one-time, then offline)

```bash
node scripts/license/activate.mjs --license "QS1.…your-key…"
```

This binds the key to this machine (up to 3 machines per license) and saves an
activation certificate. The app verifies it locally on every start — no further
network calls. Need a different activation server? Set `QS_ACTIVATION_URL`.

## 2. Configure secrets

```bash
cp .env.example .env   # if provided; otherwise create .env with:
```

Required in `.env`:

```
ATLANTEAN_API_TOKEN=<random string, used by the frontend>
ATLANTEAN_SESSION_SECRET=<random string>
```

Generate with: `openssl rand -hex 32`

## 3. Start

```bash
docker compose up -d --build
```

Open http://127.0.0.1:5000. Check health: `curl http://127.0.0.1:5000/health`.

## License

Use is governed by `EULA.md`. In short: one subscription, up to 3 machines,
no redistribution. Your copy is watermarked to your license key.

## Support

Email support with your license ID (top of `WATERMARK.txt`).
