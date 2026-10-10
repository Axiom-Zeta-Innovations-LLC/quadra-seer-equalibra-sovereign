# Quadra-Seer Sovereign — Local Runbook

Everything runs on your own machine, fully offline: **Ollama** (`:11434`) + **Python backend** (`:5001`) + **Vite frontend** (`:5000`). No API keys, no network calls. License enforcement stays off — never set `QS_LICENSE_REQUIRED`.

Verified working 2026-10-10 end-to-end (frontend → backend → Ollama → real model-generated reply).

## 1. Prerequisites

- **Python 3.10+**, **Node.js 22+**, **npm**
- **RAM:** ~4GB free for the 3B model. ~8GB+ free for the recommended 7B/8B models.
- **Ollama:** https://ollama.com/download (Linux: `curl -fsSL https://ollama.com/install.sh | sh`; Mac/Windows: installer app)

## 2. Get the code and install dependencies

```bash
git clone <your-sovereign-repo-url> quadra-sovereign
cd quadra-sovereign

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# IMPORTANT — dependency pin fix:
# requirements.txt says pyarrow>=14.0.0, but fresh installs pull pyarrow 26+,
# which requires NumPy 2.0 and breaks the pinned numpy==1.26.3 (torch 2.2.0).
# lancedb needs pyarrow>=16, so pin the working middle ground:
pip install "pyarrow==18.1.0"

npm install
```

## 3. Model

```bash
# Lighter option — needs ~4GB free RAM (what this runbook was verified with):
ollama pull qwen2.5:3b

# Recommended — needs ~8GB free RAM, noticeably better answers:
ollama pull qwen2.5:7b
# (or: ollama pull llama3.1:8b)
```

Note the model name you pulled — you need it in step 4.

## 4. Configure

```bash
cp .env.example .env.local
```

Edit `.env.local` — set these (leave everything else as shipped):

```ini
ATLANTEAN_LLM_PROVIDER=local
LOCAL_LLM_BACKEND=ollama
LOCAL_LLM_URL=http://127.0.0.1:11434/api/generate
LOCAL_LLM_MODEL=qwen2.5:3b        # match what you pulled in step 3
LOCAL_LLM_TIMEOUT_SECONDS=300     # 90 is fine on a fast CPU; 300 for slow boxes
ALLOW_OUTBOUND_NETWORK=0
ALLOW_CLOUD_ESCALATION=0
```

**First run only — encryption key.** `.env.example` ships a placeholder that crashes the backend. Generate a real one:

```bash
# inside the venv:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Paste the output into `.env.local`:

```ini
ATLANTEAN_ENCRYPTION_KEYS_JSON={"v1":"<paste-key-here>"}
```

## 5. Run (three terminals)

**Terminal A — Ollama:**

```bash
ollama serve
```

**Terminal B — backend:**

```bash
source .venv/bin/activate        # Windows: .venv\Scripts\activate
set -a; source .env.local; set +a
python atlantean_backend.py
```

Expect: `Starting server on http://127.0.0.1:5001`. A `Redis ... Connection refused` line is normal — it falls back to in-memory storage.

**Terminal C — frontend:**

```bash
npm run dev
```

Open **http://localhost:5000**

## 6. Verify each layer

```bash
# Ollama alive:
curl http://127.0.0.1:11434/api/version

# Backend alive:
curl http://127.0.0.1:5001/health
# -> {"service":"Atlantean Backend","status":"healthy"}

# Frontend alive:
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/
# -> 200

# REAL inference round-trip (first call is slow — model loads into RAM, CPU inference):
curl -X POST http://127.0.0.1:5001/api/atlantean/query \
  -H "Content-Type: application/json" \
  -d '{"input":"Say hello in five words.","llm_provider":"local"}'
# -> JSON with "generation": {"mode":"local","model_used":"<your model>","backend":"ollama"},
#    and "response" containing model-generated text.
```

## Notes

- **No Docker needed.** `docker-compose.*` files are an alternative path; this runbook uses plain processes.
- **llama.cpp instead of Ollama (advanced):** the backend also supports `LOCAL_LLM_BACKEND=llama.cpp` and `vllm`. Caution: `pip install llama-cpp-python` compiles from source and the resulting binary can SIGILL ("Illegal instruction") on CPUs lacking AVX-512 — Ollama's prebuilt binaries don't have this problem, which is why it's the recommended path.
- **Low-RAM tip:** if Ollama refuses to load ("model requires more system memory"), create a custom model with a smaller context: `Modelfile` with `PARAMETER num_ctx 512`, then `ollama create <name> -f Modelfile`.
- **Production frontend build:** `npm run build` produces `dist/`. Serve it with any static server and proxy `/api/atlantean` + `/health` to `http://127.0.0.1:5001`.
- **Windows:** use PowerShell; paths use backslashes; `npm run dev` works the same.
