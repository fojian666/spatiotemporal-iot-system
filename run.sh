#!/usr/bin/env bash
# 一键启动演示平台：按需安装依赖 → 按需构建前端 → 拉起 Mosquitto 与 API。
# 首次使用仍需先准备数据库与 backend/.env（见 README「完整模式」第 1–2 步）。
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '==> %s\n' "$*"; }

# 与 backend/run.sh 相同的取值规则：不 source，去掉引号与 CR。
env_value() {
  local key=$1 value
  [[ -f backend/.env ]] || return 0
  value=$(sed -n "s/^[[:space:]]*${key}=//p" backend/.env | tail -1)
  value="${value%$'\r'}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

if [[ ! -f backend/.env ]]; then
  echo "缺少 backend/.env：请先按 README「完整模式」第 1–2 步准备数据库与密钥。" >&2
  exit 1
fi
if [[ -z "$(env_value IOT_JWT_SECRET)" ]]; then
  echo "警告：backend/.env 未设置 IOT_JWT_SECRET，后端会启动失败。" >&2
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm：请先安装 Node.js 18+。" >&2
  exit 1
fi

API_PORT="$(env_value IOT_API_PORT)"
TLS_FLAG="$(env_value IOT_TLS_ENABLED)"
SCHEME="http"
[[ "${TLS_FLAG:-false}" == "true" ]] && SCHEME="https"
PORT="${API_PORT:-8000}"

# 前端配置缺失时按后端实际协议生成（.env.local 已被 .gitignore 忽略）
if [[ ! -f .env.local ]]; then
  say "未找到 .env.local，生成（${SCHEME}://127.0.0.1:${PORT}）"
  printf 'VITE_DATA_SOURCE=api\nVITE_API_BASE_URL=%s://127.0.0.1:%s\n' "$SCHEME" "$PORT" > .env.local
fi

if [[ ! -d node_modules ]]; then
  say "安装前端依赖（npm install）"
  npm install
fi

# 产物缺失，或源码/配置比产物新时才重建
NEED_BUILD=0
if [[ ! -f dist/index.html ]]; then
  NEED_BUILD=1
elif [[ -n "$(find src public index.html vite.config.ts package.json package-lock.json tsconfig.json tsconfig.app.json .env.local -newer dist/index.html -print -quit 2>/dev/null)" ]]; then
  NEED_BUILD=1
fi

if [[ "$NEED_BUILD" == "1" ]]; then
  say "构建前端（npm run build）"
  npm run build
fi

say "启动后端与 Mosquitto（Ctrl-C 结束）"
printf '    入口: %s://127.0.0.1:%s/\n\n' "$SCHEME" "$PORT"

exec ./backend/run.sh
