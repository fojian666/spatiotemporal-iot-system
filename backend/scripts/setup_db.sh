#!/usr/bin/env bash
set -euo pipefail
DB_NAME="${IOT_DB_NAME:-iot_platform}"
DB_USER="${PGUSER:-$(whoami)}"
HOST="${PGHOST:-127.0.0.1}"
if ! psql -h "$HOST" -U "$DB_USER" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; then
  echo "PostgreSQL is not reachable at $HOST as $DB_USER. Start it first (brew services start postgresql@16)." >&2
  exit 1
fi
if ! psql -h "$HOST" -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  createdb -h "$HOST" -U "$DB_USER" "$DB_NAME"
fi
psql -h "$HOST" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
echo "Database ${DB_NAME} is ready."
