#!/usr/bin/env bash
# =============================================================================
# Aaple Shasan — Database Backup Script
# Run via cron: 0 2 * * * /path/to/scripts/backup.sh >> /var/log/as-backup.log 2>&1
# =============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
MAX_BACKUPS=30  # keep 30 days of daily backups
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/aapleshasan_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting database backup..."

# Load env
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -E '^POSTGRES_' | xargs)
fi

# Dump via Docker
docker-compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-aapleshasan_user}" \
  -d "${POSTGRES_DB:-aapleshasan}" \
  --no-password \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"

# Remove old backups
find "$BACKUP_DIR" -name "aapleshasan_*.sql.gz" -mtime "+${MAX_BACKUPS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name "aapleshasan_*.sql.gz" | wc -l)
echo "[$(date)] Backup rotation: $REMAINING backups retained (max $MAX_BACKUPS)"

echo "[$(date)] Done."
