#!/usr/bin/env bash
# Nightly backup of the MatrixPOS data in self-hosted Supabase.
# Installed by docs/SUPABASE.md as a cron job at 02:30 UK time.
# Keeps 14 days on the VPS and copies each file to Google Drive with rclone (remote "gdrive").
set -euo pipefail
DIR=/opt/backups/matrixpos
REMOTE="${RCLONE_REMOTE:-gdrive:MatrixPOS-backups}"
mkdir -p "$DIR"
f="$DIR/matrixpos-$(date +%Y%m%d-%H%M).dump"
# Custom-format dump of the app schema only (restore with deploy/supabase/restore.sh).
docker exec supabase-db pg_dump -U postgres -d postgres -n matrixpos -Fc > "$f.tmp"
mv "$f.tmp" "$f"
echo "backup written: $f ($(du -h "$f" | cut -f1))"
find "$DIR" -name 'matrixpos-*.dump' -mtime +14 -delete
if command -v rclone >/dev/null && rclone listremotes | grep -q "^${REMOTE%%:*}:$"; then
  rclone copy "$f" "$REMOTE" && echo "copied to $REMOTE"
  rclone delete "$REMOTE" --min-age 60d || true
else
  echo "rclone remote not configured; backup kept on the VPS only" >&2
fi
