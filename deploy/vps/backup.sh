#!/bin/sh
# Runs inside the backup container. Dumps the database nightly at 02:30 UK time
# and keeps 14 days of backups.
while true; do
  if [ "$(date +%H%M)" = "0230" ]; then
    f="/backups/matrixpos-$(date +%Y%m%d-%H%M).sql.gz"
    pg_dump -h db -U matrixpos matrixpos | gzip > "$f" && echo "backup written: $f"
    # retention: remove backups older than 14 days
    find /backups -name 'matrixpos-*.sql.gz' -mtime +14 -exec rm -f {} \;
    sleep 61
  fi
  sleep 30
done
