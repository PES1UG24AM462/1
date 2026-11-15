#!/usr/bin/env bash
# =============================================================================
# backup.sh
# SAM-NF-004 — Preserve attendance data with backups and recovery.
#
# Creates a compressed, timestamped mysqldump of the SAMS database.
# Keeps the last N backups (default: 7) and removes older ones.
#
# Usage:
#   ./backend/scripts/backup.sh
#   BACKUP_RETAIN=14 ./backend/scripts/backup.sh   # keep 14 backups
#
# Environment variables (can be set in .env or exported before running):
#   DB_HOST          MySQL host          (default: localhost)
#   DB_PORT          MySQL port          (default: 3306)
#   DB_NAME          Database name       (default: student_attendance_db)
#   DB_USER          MySQL user          (default: sam_user)
#   DB_PASSWORD      MySQL password      (required)
#   BACKUP_DIR       Backup directory    (default: ./backups)
#   BACKUP_RETAIN    Backups to keep     (default: 7)
#
# Schedule with cron (daily at 02:00):
#   0 2 * * * /path/to/project/backend/scripts/backup.sh >> /var/log/sams-backup.log 2>&1
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-student_attendance_db}"
DB_USER="${DB_USER:-sam_user}"
DB_PASSWORD="${DB_PASSWORD:?ERROR: DB_PASSWORD environment variable is required}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../../backups}"
BACKUP_RETAIN="${BACKUP_RETAIN:-7}"

# ── Setup ─────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/sams_backup_${TIMESTAMP}.sql.gz"
LOG_PREFIX="[SAMS Backup ${TIMESTAMP}]"

echo "${LOG_PREFIX} Starting backup of database '${DB_NAME}' on ${DB_HOST}:${DB_PORT}"

# ── Run mysqldump ─────────────────────────────────────────────────────────────
# --single-transaction: consistent snapshot without locking tables (InnoDB)
# --routines:           include stored procedures/functions
# --triggers:           include triggers
# --hex-blob:           safe binary encoding
# --set-gtid-purged=OFF: avoids GTID issues on restore to different servers
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  --hex-blob \
  --set-gtid-purged=OFF \
  --databases "${DB_NAME}" \
  | gzip -9 > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "${LOG_PREFIX} Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Verify the backup is non-empty ────────────────────────────────────────────
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "${LOG_PREFIX} ERROR: Backup file is empty. Aborting."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# ── Write a checksum file for integrity verification on restore ───────────────
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
echo "${LOG_PREFIX} Checksum written: ${CHECKSUM_FILE}"

# ── Rotate old backups — keep only the last N ─────────────────────────────────
echo "${LOG_PREFIX} Rotating backups (keeping last ${BACKUP_RETAIN})…"
ls -1t "${BACKUP_DIR}"/sams_backup_*.sql.gz 2>/dev/null \
  | tail -n +"$((BACKUP_RETAIN + 1))" \
  | while read -r OLD_FILE; do
      rm -f "${OLD_FILE}" "${OLD_FILE}.sha256"
      echo "${LOG_PREFIX} Removed old backup: ${OLD_FILE}"
    done

BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/sams_backup_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
echo "${LOG_PREFIX} Backup rotation complete. ${BACKUP_COUNT} backup(s) retained."
echo "${LOG_PREFIX} Done."
