#!/usr/bin/env bash
# 一键启动演示平台：按需安装依赖 → 按需构建前端 → 拉起 Mosquitto 与 API。
# 首次使用仍需先准备数据库与 backend/.env（见 README「完整模式」第 1–2 步）。
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '==> %s\n' "$*"; }

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm：请先安装 Node.js 18+。" >&2
  exit 1
fi

# 前端配置缺失时按示例生成（.env.local 已被 .gitignore 忽略）
if [[ ! -f .env.local ]]; then
  say "未找到 .env.local，按 .env.example 生成（VITE_DATA_SOURCE=api）"
  cp .env.example .env.local
fi

if [[ ! -d node_modules ]]; then
  say "安装前端依赖（npm install）"
  npm install
fi

# 产物缺失，或源码/配置比产物新时才重建
NEED_BUILD=0
if [[ ! -f dist/index.html ]]; then
  NEED_BUILD=1
elif [[ -n "$(find src public index.html vite.config.ts package.json .env.local -newer dist/index.html -print -quit 2>/dev/null)" ]]; then
  NEED_BUILD=1
fi

if [[ "$NEED_BUILD" == "1" ]]; then
  say "构建前端（npm run build）"
  npm run build
fi

# 入口地址跟随 backend/.env 的端口与 TLS 开关
API_PORT="$(sed -n 's/^[[:space:]]*IOT_API_PORT=//p' backend/.env 2>/dev/null | tail -1)"
TLS_FLAG="$(sed -n 's/^[[:space:]]*IOT_TLS_ENABLED=//p' backend/.env 2>/dev/null | tail -1)"
SCHEME="http"
[[ "${TLS_FLAG:-false}" == "true" ]] && SCHEME="https"

say "启动后端与 Mosquitto（Ctrl-C 结束）"
printf '    入口: %s://127.0.0.1:%s/\n\n' "$SCHEME" "${API_PORT:-8000}"

exec ./backend/run.sh
