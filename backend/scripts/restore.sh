#!/usr/bin/env bash
# =============================================================================
# restore.sh
# SAM-NF-004 — Restore attendance data from a backup file.
#
# Verifies the backup's SHA-256 checksum before restoring.
# Refuses to restore if the checksum is missing or does not match.
#
# Usage:
#   ./backend/scripts/restore.sh <backup_file.sql.gz>
#
# Example:
#   ./backend/scripts/restore.sh backups/sams_backup_20261022_020000.sql.gz
#
# Environment variables:
#   DB_HOST        (default: localhost)
#   DB_PORT        (default: 3306)
#   DB_USER        MySQL user with RESTORE privileges
#   DB_PASSWORD    MySQL password (required)
# =============================================================================

set -euo pipefail

# ── Argument check ─────────────────────────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# ── Configuration ──────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-sam_user}"
DB_PASSWORD="${DB_PASSWORD:?ERROR: DB_PASSWORD environment variable is required}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_PREFIX="[SAMS Restore ${TIMESTAMP}]"

echo "${LOG_PREFIX} Starting restore from: ${BACKUP_FILE}"

# ── Step 1: Verify SHA-256 checksum ───────────────────────────────────────────
# SAM-NF-004: recovery test must restore a valid backup without inconsistent records.
# The checksum proves the backup file has not been corrupted or tampered with.
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${CHECKSUM_FILE}" ]; then
  echo "${LOG_PREFIX} ERROR: Checksum file not found: ${CHECKSUM_FILE}"
  echo "${LOG_PREFIX} Cannot verify backup integrity. Restore aborted."
  exit 1
fi

echo "${LOG_PREFIX} Verifying SHA-256 checksum…"
if ! sha256sum --check "${CHECKSUM_FILE}" --status; then
  echo "${LOG_PREFIX} ERROR: Checksum mismatch — backup file may be corrupt or tampered."
  exit 1
fi
echo "${LOG_PREFIX} Checksum OK."

# ── Step 2: Confirm before proceeding ─────────────────────────────────────────
echo ""
echo "  WARNING: This will overwrite the existing database."
echo "  Backup file : ${BACKUP_FILE}"
printf "  Continue? [yes/N]: "
read -r CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "${LOG_PREFIX} Restore cancelled by user."
  exit 0
fi

# ── Step 3: Decompress and pipe into MySQL ────────────────────────────────────
echo "${LOG_PREFIX} Restoring database…"
gunzip -c "${BACKUP_FILE}" | mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}"

echo "${LOG_PREFIX} Restore complete."
echo "${LOG_PREFIX} Run the application and verify attendance records are intact."
