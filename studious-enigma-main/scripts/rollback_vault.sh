#!/usr/bin/env bash
# =============================================================================
# rollback_vault.sh — Restore Atlantean Vault from an encrypted backup.
#
# Usage:
#   bash scripts/rollback_vault.sh <backup.tar.gz.gpg>
#
# Stops services, restores files, and restarts services.
# Requires the GPG key or passphrase used to encrypt the backup.
# =============================================================================
set -euo pipefail

VAULT_DIR="${VAULT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_FILE="${1:-}"

log()  { echo "▶  $*"; }
ok()   { echo "✅ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }
warn() { echo "⚠️  $*"; }

[[ -z "$BACKUP_FILE" ]] && fail "Usage: $0 <backup.tar.gz.gpg>"
[[ -f "$BACKUP_FILE" ]] || fail "Backup file not found: $BACKUP_FILE"

# ── 1. Confirmation ───────────────────────────────────────────────────────────
echo ""
warn "This will overwrite the current Vault configuration and voice models."
echo "  Backup  : $BACKUP_FILE"
echo "  Vault   : $VAULT_DIR"
echo ""
read -rp "Type 'yes' to proceed: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { log "Aborted."; exit 0; }

# ── 2. Stop services ──────────────────────────────────────────────────────────
log "Stopping Atlantean backend..."
if systemctl is-active --quiet atlantean-backend 2>/dev/null; then
    systemctl stop atlantean-backend
    ok "Service stopped"
elif pkill -f "python.*atlantean_backend" 2>/dev/null; then
    ok "Process killed"
fi

# ── 3. Pre-rollback snapshot ──────────────────────────────────────────────────
PRE_BACKUP="$VAULT_DIR/.pre-rollback-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
log "Creating pre-rollback snapshot: $PRE_BACKUP"
tar -czf "$PRE_BACKUP" \
    -C "$VAULT_DIR" \
    --ignore-failed-read \
    .env.local model_checksums.json voices flask_session 2>/dev/null || true
ok "Pre-rollback snapshot saved"

# ── 4. Decrypt and extract ────────────────────────────────────────────────────
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

log "Decrypting backup..."
gpg --decrypt --output "$TMPDIR/restore.tar.gz" "$BACKUP_FILE"
ok "Decrypted"

log "Extracting to $VAULT_DIR ..."
tar -xzf "$TMPDIR/restore.tar.gz" -C "$VAULT_DIR" 2>/dev/null || \
    tar -xzf "$TMPDIR/restore.tar.gz" --strip-components=1 -C "$VAULT_DIR"
ok "Extracted"

# ── 5. Restart services ───────────────────────────────────────────────────────
log "Restarting Atlantean backend..."
if systemctl is-enabled --quiet atlantean-backend 2>/dev/null; then
    systemctl start atlantean-backend
    sleep 3
    if systemctl is-active --quiet atlantean-backend; then
        ok "Service started"
    else
        warn "Service failed to start. Check: journalctl -u atlantean-backend -n 50"
    fi
else
    log "systemd unit not installed. Start manually: python atlantean_backend.py"
fi

# ── 6. Health check ───────────────────────────────────────────────────────────
PORT="${ATLANTEAN_PORT:-5001}"
HOST="${ATLANTEAN_BIND_HOST:-127.0.0.1}"
for i in $(seq 1 10); do
    if curl -fsS "http://${HOST}:${PORT}/health" >/dev/null 2>&1; then
        ok "Backend healthy at http://${HOST}:${PORT}/health"
        echo ""
        ok "Rollback complete."
        exit 0
    fi
    sleep 2
done
warn "Backend not responding after rollback. Check logs."
exit 1
