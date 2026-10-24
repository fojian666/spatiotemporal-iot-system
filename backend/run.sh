#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Read a few switches from backend/.env without sourcing untrusted shell code.
# Shell-exported values keep precedence over the file.
dotenv() {
  local key=$1 value
  if [[ -n "${!key:-}" || ! -f .env ]]; then
    return 0
  fi
  value=$(sed -n "s/^[[:space:]]*${key}=//p" .env | tail -1)
  value="${value%$'\r'}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  if [[ -n "$value" ]]; then
    export "${key}=${value}"
  fi
}

dotenv IOT_MQTT_PORT
dotenv IOT_TLS_ENABLED
dotenv IOT_API_PORT

if ! lsof -nP -iTCP:"${IOT_MQTT_PORT:-8883}" -sTCP:LISTEN >/dev/null 2>&1; then
  MOSQ_BIN="$(command -v mosquitto || echo /opt/homebrew/opt/mosquitto/sbin/mosquitto)"
  "$MOSQ_BIN" -c mosquitto/mosquitto.conf -d
fi

TLS_FLAG="${IOT_TLS_ENABLED:-false}"
if [[ "$TLS_FLAG" == "true" ]]; then
  if [[ ! -f certs/server.pem || ! -f certs/server-key.pem ]]; then
    echo "IOT_TLS_ENABLED=true，但缺少 certs/server.pem 或 certs/server-key.pem。" >&2
    echo "拒绝以明文降级启动；请先运行 certs 生成脚本，或显式设置 IOT_TLS_ENABLED=false。" >&2
    exit 1
  fi
  exec .venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "${IOT_API_PORT:-8443}" \
    --ssl-certfile certs/server.pem \
    --ssl-keyfile certs/server-key.pem
fi

exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${IOT_API_PORT:-8000}"
