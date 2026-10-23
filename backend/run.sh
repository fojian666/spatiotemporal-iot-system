#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! lsof -nP -iTCP:"${IOT_MQTT_PORT:-8883}" -sTCP:LISTEN >/dev/null 2>&1; then
  MOSQ_BIN="$(command -v mosquitto || echo /opt/homebrew/opt/mosquitto/sbin/mosquitto)"
  "$MOSQ_BIN" -c mosquitto/mosquitto.conf -d
fi

TLS_FLAG="${IOT_TLS_ENABLED:-false}"
if [[ "$TLS_FLAG" == "true" && -f certs/server.pem && -f certs/server-key.pem ]]; then
  exec .venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "${IOT_API_PORT:-8443}" \
    --ssl-certfile certs/server.pem \
    --ssl-keyfile certs/server-key.pem
else
  exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${IOT_API_PORT:-8000}"
fi
