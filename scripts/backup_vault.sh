#!/usr/bin/env bash
# =============================================================================
# backup_vault.sh — Snapshot Atlantean Vault state to an encrypted archive.
#
# Creates a timestamped backup of:
#   - .env.local (secrets/config)
#   - voices/     (Piper voice models)
#   - model_checksums.json
#   - flask_session/ (filesystem session store, if present)
#
# The archive is GPG-encrypted using the operator's key or a passphrase.
#
# Usage:
#   bash scripts/backup_vault.sh                         # GPG passphrase
#   BACKUP_GPG_KEY=<keyid> bash scripts/backup_vault.sh  # GPG asymmetric
#   BACKUP_DIR=/mnt/backup bash scripts/backup_vault.sh  # custom output dir
# =============================================================================
set -euo pipefail

VAULT_DIR="${VAULT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/vault-backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="vault-backup-${TIMESTAMP}.tar.gz"
FINAL_NAME="${ARCHIVE_NAME}.gpg"
GPG_KEY="${BACKUP_GPG_KEY:-}"

mkdir -p "$BACKUP_DIR"

log()  { echo "▶  $*"; }
ok()   { echo "✅ $*"; }
fail() { echo "❌ $*" >&2; exit 1; }

# ── 1. Collect files ──────────────────────────────────────────────────────────
INCLUDE_PATHS=()

for f in ".env.local" "model_checksums.json"; do
    p="$VAULT_DIR/$f"
    [[ -f "$p" ]] && INCLUDE_PATHS+=("$p")
done

[[ -d "$VAULT_DIR/voices" ]]         && INCLUDE_PATHS+=("$VAULT_DIR/voices")
[[ -d "$VAULT_DIR/flask_session" ]]  && INCLUDE_PATHS+=("$VAULT_DIR/flask_session")

if [[ ${#INCLUDE_PATHS[@]} -eq 0 ]]; then
    fail "Nothing to back up. Run from the project root or set VAULT_DIR."
fi

log "Creating archive: $ARCHIVE_NAME"
tar -czf "/tmp/${ARCHIVE_NAME}" -C / "${INCLUDE_PATHS[@]/#\//}"  2>/dev/null || \
    tar -czf "/tmp/${ARCHIVE_NAME}" "${INCLUDE_PATHS[@]}"

# ── 2. Encrypt ────────────────────────────────────────────────────────────────
if [[ -n "$GPG_KEY" ]]; then
    log "Encrypting with GPG key: $GPG_KEY"
    gpg --yes --recipient "$GPG_KEY" --encrypt \
        --output "$BACKUP_DIR/$FINAL_NAME" \
        "/tmp/$ARCHIVE_NAME"
else
    log "Encrypting with GPG passphrase (interactive)"
    gpg --yes --symmetric --cipher-algo AES256 \
        --output "$BACKUP_DIR/$FINAL_NAME" \
        "/tmp/$ARCHIVE_NAME"
fi

rm -f "/tmp/$ARCHIVE_NAME"

# ── 3. Report ─────────────────────────────────────────────────────────────────
SIZE="$(du -sh "$BACKUP_DIR/$FINAL_NAME" | cut -f1)"
ok "Backup complete: $BACKUP_DIR/$FINAL_NAME ($SIZE)"

# Keep last 7 backups
ls -t "$BACKUP_DIR"/vault-backup-*.tar.gz.gpg 2>/dev/null | tail -n +8 | xargs -r rm --
KEPT="$(ls "$BACKUP_DIR"/vault-backup-*.tar.gz.gpg 2>/dev/null | wc -l)"
log "Backups retained: $KEPT"
