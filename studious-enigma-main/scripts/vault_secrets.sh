#!/usr/bin/env bash
# =============================================================================
# vault_secrets.sh — Generate all Vault runtime secrets.
#
# Usage:
#   bash scripts/vault_secrets.sh            # prints to stdout
#   bash scripts/vault_secrets.sh > /etc/vault/atlantean.env
#
# Run once after install_vault.sh.  Store the output in /etc/vault/atlantean.env
# (chmod 600, owned by root or the vault service user).
# =============================================================================
set -euo pipefail

gen() { python3 -c "import secrets; print(secrets.token_hex($1))"; }

API_TOKEN="$(gen 32)"
SESSION_SECRET="$(gen 32)"
ENCRYPTION_KEY="$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || echo 'INSTALL_cryptography_first')"

cat <<EOF
# ============================================================
# Atlantean Vault — Runtime Secrets
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ============================================================
# KEEP THIS FILE PRIVATE.  chmod 600.  Do NOT commit to git.
# ============================================================

# Bearer-token auth (backend enforces, frontend reads as VITE_API_TOKEN)
ATLANTEAN_API_TOKEN=${API_TOKEN}
VITE_API_TOKEN=${API_TOKEN}

# Flask session signing key
ATLANTEAN_SESSION_SECRET=${SESSION_SECRET}

# At-rest memory encryption (Fernet key)
ATLANTEAN_ENCRYPTION_ENABLED=1
ATLANTEAN_ENCRYPTION_ACTIVE_KEY_ID=v1
ATLANTEAN_ENCRYPTION_KEYS_JSON={"v1":"${ENCRYPTION_KEY}"}

# Network binding — loopback only for Vault
ATLANTEAN_BIND_HOST=127.0.0.1
ATLANTEAN_PORT=5001
SESSION_COOKIE_SECURE=0

# CORS — localhost frontend only
ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000,http://localhost:5173,http://127.0.0.1:5173
EOF
