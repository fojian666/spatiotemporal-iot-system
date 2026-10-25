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
dotenv IOT_MQTT_ENABLED
dotenv IOT_TLS_ENABLED
dotenv IOT_API_PORT

# ---------------------------------------------------------------------------
# Python interpreter autodetection.
# Order: IOT_PYTHON > active conda env > project .venv > conda base > PATH python3.
# Each candidate must import the backend deps; the first capable one wins.
# ---------------------------------------------------------------------------
has_backend_deps() {
  "$1" -c 'import fastapi, uvicorn, sqlalchemy, asyncpg, paho.mqtt.client, geoalchemy2, pydantic_settings, jwt, pwdlib' >/dev/null 2>&1
}

CANDIDATES=()
add_candidate() {
  local py=$1 existing
  [[ -n "$py" && -x "$py" ]] || return 0
  for existing in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
    [[ "$existing" == "$py" ]] && return 0
  done
  CANDIDATES+=("$py")
}

add_candidate "${IOT_PYTHON:-}"
if [[ -n "${CONDA_PREFIX:-}" ]]; then
  add_candidate "$CONDA_PREFIX/bin/python"
fi
add_candidate "$PWD/.venv/bin/python"

# conda is often a shell function, invisible to scripts: also probe known roots.
CONDA_BASE=""
if command -v conda >/dev/null 2>&1; then
  CONDA_BASE="$(conda info --base 2>/dev/null || true)"
fi
for root in "$CONDA_BASE" /opt/anaconda3 /opt/miniconda3 /opt/homebrew/anaconda3 \
  "${HOME:-}/anaconda3" "${HOME:-}/miniconda3" "${HOME:-}/miniforge3"; do
  [[ -n "$root" ]] && add_candidate "$root/bin/python"
done

if command -v python3 >/dev/null 2>&1; then
  add_candidate "$(command -v python3)"
fi

PY_BIN=""
for candidate in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
  if has_backend_deps "$candidate"; then
    PY_BIN="$candidate"
    break
  fi
done

if [[ -z "$PY_BIN" ]]; then
  echo "未找到具备后端依赖的 Python 解释器。已尝试：" >&2
  for candidate in ${CANDIDATES[@]+"${CANDIDATES[@]}"}; do
    echo "  - $candidate" >&2
  done
  echo "请为其中一个安装依赖：<python> -m pip install -r requirements.txt" >&2
  echo "或用 IOT_PYTHON=/path/to/python 显式指定解释器。" >&2
  exit 1
fi
echo "Python: $PY_BIN"

# ---------------------------------------------------------------------------
# Mosquitto (skipped when IOT_MQTT_ENABLED=false).
# ---------------------------------------------------------------------------
if [[ "${IOT_MQTT_ENABLED:-true}" == "false" ]]; then
  echo "IOT_MQTT_ENABLED=false，跳过 Mosquitto。"
elif ! lsof -nP -iTCP:"${IOT_MQTT_PORT:-8883}" -sTCP:LISTEN >/dev/null 2>&1; then
  MOSQ_BIN="$(command -v mosquitto || echo /opt/homebrew/opt/mosquitto/sbin/mosquitto)"
  if [[ ! -x "$MOSQ_BIN" ]]; then
    echo "未找到 mosquitto。请安装后重试，或在 backend/.env 设置 IOT_MQTT_ENABLED=false。" >&2
    exit 1
  fi
  "$MOSQ_BIN" -c mosquitto/mosquitto.conf -d
  for _ in $(seq 1 30); do
    lsof -nP -iTCP:"${IOT_MQTT_PORT:-8883}" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 0.1
  done
  if ! lsof -nP -iTCP:"${IOT_MQTT_PORT:-8883}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Mosquitto 启动后端口 ${IOT_MQTT_PORT:-8883} 仍未监听，请检查 mosquitto/mosquitto.conf 与证书。" >&2
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
TLS_FLAG="${IOT_TLS_ENABLED:-false}"
if [[ "$TLS_FLAG" == "true" ]]; then
  if [[ ! -f certs/server.pem || ! -f certs/server-key.pem ]]; then
    echo "IOT_TLS_ENABLED=true，但缺少 certs/server.pem 或 certs/server-key.pem。" >&2
    echo "拒绝以明文降级启动；请先运行 certs 生成脚本，或显式设置 IOT_TLS_ENABLED=false。" >&2
    exit 1
  fi
  echo "API: https://127.0.0.1:${IOT_API_PORT:-8443}/"
  exec "$PY_BIN" -m uvicorn app.main:app \
    --host 127.0.0.1 \
    --port "${IOT_API_PORT:-8443}" \
    --no-proxy-headers \
    --ssl-certfile certs/server.pem \
    --ssl-keyfile certs/server-key.pem
fi

# No reverse proxy fronts this demo; do not trust spoofable X-Forwarded-For.
echo "API: http://127.0.0.1:${IOT_API_PORT:-8000}/"
exec "$PY_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port "${IOT_API_PORT:-8000}" --no-proxy-headers
