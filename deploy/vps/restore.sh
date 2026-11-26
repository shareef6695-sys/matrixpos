#!/usr/bin/env bash
# Restore a backup:  ./restore.sh backups/matrixpos-20261126-0230.sql.gz
# WARNING: this replaces the live database. It asks you to confirm first.
set -euo pipefail
cd "$(dirname "$0")"
FILE="${1:?Usage: ./restore.sh <backup file>}"
read -r -p "This will REPLACE the live database with $FILE. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || exit 1
docker exec -i matrixpos-db psql -U matrixpos -d postgres -c "DROP DATABASE IF EXISTS matrixpos WITH (FORCE);" -c "CREATE DATABASE matrixpos OWNER matrixpos;"
gunzip -c "$FILE" | docker exec -i matrixpos-db psql -U matrixpos -d matrixpos
echo "Restored."
