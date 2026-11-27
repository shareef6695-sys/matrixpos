#!/usr/bin/env bash
# Restore MatrixPOS data from a backup made by backup.sh.
# Usage: sudo ./restore.sh /opt/backups/matrixpos/matrixpos-YYYYMMDD-HHMM.dump
# WARNING: replaces everything currently in the matrixpos schema.
set -euo pipefail
f="${1:?usage: restore.sh <file.dump>}"
read -r -p "This replaces all MatrixPOS data with $f. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists --no-owner < "$f"
echo "Restored from $f"
