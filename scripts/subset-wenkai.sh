#!/usr/bin/env bash
# 重新生成霞鹜文楷（LXGW WenKai）网页子集 —— SIL OFL 1.1
#
# 为什么要子集：完整 TTF 25MB，网页只用到项目文案里那批字。
# 字符集 = src/ 与 index.html 里出现的全部字符 + ASCII + 常用中文标点。
# 因此新增文案若用了子集外的字，会回落到 --font-serif 的系统衬线兜底；
# 想彻底覆盖，重跑本脚本即可（体积会随用字量增长）。
#
# 依赖：fonttools + brotli。脚本先找可用的调用方式，都不行就明确报错，
# 不会像早先版本那样"看起来探测了、实际用错解释器"。
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
VERSION=v1.530
TTF_URL="https://github.com/lxgw/LxgwWenKai/releases/download/${VERSION}/LXGWWenKai-Regular.ttf"
OUT="$ROOT/public/fonts/lxgw-wenkai-sc-regular.woff2"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ 找不到 python3" >&2
  exit 1
fi

if command -v pyftsubset >/dev/null 2>&1; then
  SUBSET=(pyftsubset)
elif python3 -c 'import fontTools' 2>/dev/null; then
  SUBSET=(python3 -m fontTools.subset)
else
  echo "✗ 找不到 fonttools。请先安装：pip install fonttools brotli" >&2
  exit 1
fi
echo "→ 子集工具：${SUBSET[*]}"

echo "→ 下载字体 ${VERSION}"
curl -fsSL --retry 3 -o "$WORK/LXGWWenKai-Regular.ttf" "$TTF_URL"

echo "→ 收集项目用字"
python3 - "$ROOT" "$WORK/chars.txt" <<'PY'
import pathlib, sys

root, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
chars = set()
for pattern in ('src/**/*.ts', 'src/**/*.tsx', 'index.html'):
    for path in root.glob(pattern):
        chars |= set(path.read_text(encoding='utf-8'))
chars |= {chr(c) for c in range(0x20, 0x7f)}
chars |= set('，。、；：？！“”‘’（）《》〈〉…—·「」『』【】￥％℃°±×÷≤≥→←↑↓')
out.write_text(''.join(sorted(chars)), encoding='utf-8')
print(f'   {len(chars)} 个字符')
PY

mkdir -p "$(dirname "$OUT")"
echo "→ 子集化"
"${SUBSET[@]}" "$WORK/LXGWWenKai-Regular.ttf" \
  --text-file="$WORK/chars.txt" \
  --flavor=woff2 \
  --no-hinting \
  --layout-features='kern,liga' \
  --output-file="$OUT"

ls -lh "$OUT"
echo "→ 完成。若体积明显变大，检查是否误把 node_modules 或 dist 纳入扫描。"
