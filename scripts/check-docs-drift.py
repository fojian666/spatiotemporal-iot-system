#!/usr/bin/env python3
"""文档漂移检查：把四份 md 里的关键数字与源码真值对一遍。

用法：python3 scripts/check-docs-drift.py        # 有漂移时退出码 1
     python3 scripts/check-docs-drift.py -v     # 打印每个取到的真值

为什么需要它：一天之内踩到四次漂移（1.2 vs 1.65、15s vs 30s、"本地演示推理" vs
云端、SECURITY.md 漏掉数据外发），全部是"代码改了、文档没跟上"。人工逐条核对照样会漏，
所以把真值直接从源码里读出来比。

只做机械比对，不判断语义。文档里"能力描述"这类还需要人看。
"""

from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def grab(pattern: str, source: str, cast=float):
    match = re.search(pattern, source)
    if not match:
        raise SystemExit(f'✗ 取不到真值：{pattern}（{source[:40]}…）')
    return cast(match.group(1))


frontend_map = read('src/components/MapView.tsx')
api_ts = read('src/services/api.ts')
config_py = read('backend/app/config.py')
copilot_py = read('backend/app/copilot.py')
main_py = read('backend/app/main.py')
drone_py = read('backend/app/drone_api.py')
knowledge = json.loads(read('backend/app/data/knowledge.json'))

FACTS: dict[str, tuple[object, list[str]]] = {
    '地形夸张度': (grab(r'TERRAIN_EXAGGERATION = ([\d.]+)', frontend_map), ['AGENTS.md']),
    '地形俯角': (int(grab(r'TERRAIN_PITCH = (\d+)', frontend_map, int)), ['AGENTS.md']),
    '平面俯角': (int(grab(r'FLAT_PITCH = (\d+)', frontend_map, int)), ['AGENTS.md']),
    '默认请求超时(秒)': (
        int(grab(r'REQUEST_TIMEOUT_MS = ([\d_]+)', api_ts, lambda v: int(v.replace('_', ''))) / 1000),
        ['AGENTS.md', 'SECURITY.md'],
    ),
    '推理请求超时(秒)': (
        int(grab(r'COPILOT_TIMEOUT_MS = ([\d_]+)', api_ts, lambda v: int(v.replace('_', ''))) / 1000),
        ['AGENTS.md', 'SECURITY.md'],
    ),
    'LLM 读超时(秒)': (int(grab(r'llm_timeout_seconds: float = ([\d.]+)', config_py)), ['AGENTS.md']),
    'LLM 输出上限(token)': (grab(r'llm_max_tokens: int = (\d+)', config_py, int), ['AGENTS.md']),
    '上下文上限(字符)': (grab(r'MAX_CONTEXT_CHARS = (\d+)', copilot_py, int), ['AGENTS.md']),
    '知识实体数': (len(knowledge['nodes']), ['AGENTS.md', 'SECURITY.md']),
    '知识关系数': (len(knowledge['links']), ['AGENTS.md']),
    'main.py 路由数': (
        len(re.findall(r'^@app\.(?:get|post|put|delete|patch)', main_py, re.M)),
        ['AGENTS.md'],
    ),
    'drone_api 路由数': (
        len(re.findall(r'^@router\.(?:get|post|put|delete|patch)', drone_py, re.M)),
        ['AGENTS.md'],
    ),
}

# 已知的历史值：出现即说明文档没跟上代码。
# 注意：这里**不能**放"1.2""28°"这类数值旧值——AGENTS.md 会以反例形式引用它们
# （"压到 1.2/28° 时全图平均像素差只有 33/765，肉眼判为没做"），机械子串匹配必然误报。
# 数值类旧值靠 FACTS 里的"必须出现真值"来保证，这类定性表述只能人看。
STALE = [
    ('AGENTS.md', '~24 端点', '端点数旧值'),
    ('README.md', '不调用真实大模型', '接入云端后已不成立'),
    ('SECURITY.md', 'Copilot 为本地规则引擎', '接入云端后已不成立'),
]

DOCS = ['AGENTS.md', 'DESIGN.md', 'README.md', 'SECURITY.md']
verbose = '-v' in sys.argv
failures: list[str] = []

print('文档漂移检查\n')
for name, (value, must_appear) in FACTS.items():
    if verbose:
        print(f'  · {name} = {value}')
    for doc in must_appear:
        if doc not in DOCS:
            continue
        text = read(doc)
        if str(value) not in text:
            failures.append(f'[{doc}] 未出现 {name} = {value}')

for doc, needle, why in STALE:
    if needle in read(doc):
        failures.append(f'[{doc}] 残留陈旧值「{needle}」—— {why}')

if failures:
    print('\n✗ 发现漂移：')
    for item in failures:
        print(f'  - {item}')
    print(f'\n共 {len(failures)} 处。改掉后重跑。')
    raise SystemExit(1)

print('\n✓ 四份文档与源码无漂移。')
print('  仍需人工判断的：能力描述是否过时、清单是否覆盖本轮新增内容。')
