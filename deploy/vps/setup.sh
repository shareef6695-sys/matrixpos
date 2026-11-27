#!/usr/bin/env bash
# One-time setup for the MatrixPOS database on an Ubuntu/Debian VPS.
# Run from this folder:  sudo ./setup.sh db.yourdomain.co.uk   (or the server's IP address)
set -euo pipefail
HOST="${1:-}"
if [ -z "$HOST" ]; then echo "Usage: sudo ./setup.sh <database hostname or server IP>"; exit 1; fi
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  PW=$(openssl rand -base64 36 | tr -d '/+=' | cut -c1-40)
  printf "POSTGRES_PASSWORD=%s\nDB_PORT=5432\n" "$PW" > .env
  chmod 600 .env
  echo "Created .env with a random database password."
fi

mkdir -p certs backups
if [ ! -f certs/server.crt ]; then
  echo "Creating a TLS certificate for $HOST..."
  openssl req -new -x509 -days 3650 -nodes -subj "/CN=$HOST" \
    -keyout certs/server.key -out certs/server.crt 2>/dev/null
  # postgres in the alpine image runs as uid 70 and needs a private key file
  chown 70:70 certs/server.key certs/server.crt
  chmod 600 certs/server.key
fi
chmod +x backup.sh

if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null
  ufw allow 5432/tcp >/dev/null
  ufw --force enable >/dev/null
  echo "Firewall: SSH and PostgreSQL (5432) open."
fi

docker compose up -d
sleep 5
docker compose ps

PW=$(grep POSTGRES_PASSWORD .env | cut -d= -f2)
echo
echo "Done. Add this to Vercel as both DATABASE_URL and DIRECT_URL (Production and Preview):"
echo
echo "  postgresql://matrixpos:${PW}@${HOST}:5432/matrixpos?sslmode=require&sslaccept=accept_invalid_certs&connection_limit=5&pool_timeout=20"
echo
echo "Keep it secret. Backups are written nightly to $(pwd)/backups."
