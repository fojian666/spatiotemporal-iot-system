"""Copilot 的上下文组装与检索。

规模决定了实现方式：知识图谱 56 实体 / 126 关系，设备 21 个。
这个量级下关键词命中 + 图谱一跳邻居已经够用，**刻意不上向量库**——
200 个 chunk 用 numpy 暴力检索也是亚毫秒，FAISS/pgvector 属过度设计。
真要扩到整本书稿（上千 chunk）再回头谈嵌入。

上下文块要严格控制长度：每多 100 token 就是多一份成本，也会稀释模型注意力。
"""

from __future__ import annotations

from typing import Any, Iterable

from .data import DEVICE_BY_ID, DEVICES, KNOWLEDGE, SCENARIOS

MAX_CONTEXT_CHARS = 1200  # 约 600 token

_NODES: list[dict[str, Any]] = KNOWLEDGE.get("nodes", [])
_LINKS: list[dict[str, Any]] = KNOWLEDGE.get("links", [])
_NODE_BY_ID = {node["id"]: node for node in _NODES}
_NEIGHBORS: dict[str, list[tuple[str, str]]] = {}
for _link in _LINKS:
    _NEIGHBORS.setdefault(_link["source"], []).append((_link["target"], _link.get("rel", "")))
    _NEIGHBORS.setdefault(_link["target"], []).append((_link["source"], _link.get("rel", "")))


def _match_nodes(query: str, limit: int = 3) -> list[dict[str, Any]]:
    """按实体名命中检索。

    只认实体名的字面重合，不做 desc 模糊匹配：早期版本把描述里的 2-gram 也算分，
    结果"水位超警戒怎么处置"会命中「城市治理」「无人机巡检」——这些描述里都有
    "处置""巡检"，噪声直接污染上下文。宁可不给知识，也不给错知识。
    """
    scored: list[tuple[float, dict[str, Any]]] = []
    for node in _NODES:
        name = node.get("name", "")
        if not name:
            continue
        if name in query:
            scored.append((10.0, node))
            continue
        grams = [name[i : i + 2] for i in range(len(name) - 1)]
        if not grams:
            continue
        covered = sum(1 for gram in grams if gram in query)
        # 至少覆盖一半的名称片段才算命中（"智慧水务" → "水务" 单独出现不算）
        if covered >= max(2, (len(grams) + 1) // 2):
            scored.append((covered * 1.5, node))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [node for _, node in scored[:limit]]


def _severity(value: float, metric: dict[str, Any]) -> int:
    """0 = 正常，1 = 过预警阈值，2 = 过严重阈值。"""
    warn, crit = metric.get("warn"), metric.get("crit")
    direction = metric.get("direction", "high")
    if direction == "high":
        if crit is not None and value >= crit:
            return 2
        if warn is not None and value >= warn:
            return 1
    elif direction == "low":
        if crit is not None and value <= crit:
            return 2
        if warn is not None and value <= warn:
            return 1
    else:  # range
        low = metric.get("low")
        if crit is not None and value >= crit:
            return 2
        if (warn is not None and value >= warn) or (low is not None and value <= low):
            return 1
    return 0


def _metric_text(device: dict[str, Any], reading: dict[str, Any], limit: int = 3) -> str:
    """按超阈值程度排序取前几条。

    早先直接取 metrics[:3]，会刚好把越线的那个指标切掉——预警设备报了一堆正常读数、
    唯独漏掉水位，模型据此回答"未提供水位数据"，属于典型的上下文污染。
    """
    picked: list[tuple[int, dict[str, Any], float]] = []
    for metric in device.get("metrics") or []:
        value = reading.get(metric["key"])
        if value is None:
            continue
        try:
            picked.append((_severity(float(value), metric), metric, float(value)))
        except (TypeError, ValueError):
            continue
    picked.sort(key=lambda item: item[0], reverse=True)
    parts = [
        f"{metric['label']} {value:g}{metric.get('unit', '')}" + ("（超阈值）" if severity else "")
        for severity, metric, value in picked[:limit]
    ]
    return "、".join(parts) or "无读数"


def _device_lines(snapshot: dict[str, Any], focus_device: str | None) -> list[str]:
    readings: dict[str, dict[str, Any]] = snapshot.get("readings") or {}
    statuses: dict[str, str] = snapshot.get("statuses") or {}

    counts = {"online": 0, "warning": 0, "offline": 0}
    for device in DEVICES:
        status = statuses.get(device["id"], "offline")
        counts[status] = counts.get(status, 0) + 1
    lines = [
        f"设备：共 {len(DEVICES)} 个节点，在线 {counts['online']}、预警 {counts['warning']}、离线 {counts['offline']}。"
    ]

    abnormal = [d for d in DEVICES if statuses.get(d["id"]) == "warning"]
    for device in abnormal[:3]:
        reading = readings.get(device["id"]) or {}
        lines.append(f"预警设备：{device['id']} {device['name']}（{_metric_text(device, reading)}）")

    if focus_device and focus_device in DEVICE_BY_ID:
        device = DEVICE_BY_ID[focus_device]
        reading = readings.get(focus_device) or {}
        lines.append(f"当前关注：{device['id']} {device['name']}（{_metric_text(device, reading, 4)}）")

    return lines


def _knowledge_lines(nodes: Iterable[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for node in nodes:
        desc = (node.get("desc") or "").strip()
        if len(desc) > 70:
            desc = desc[:70] + "…"
        neighbors = _NEIGHBORS.get(node["id"], [])[:3]
        related = "、".join(
            f"{_NODE_BY_ID[target]['name']}（{rel}）"
            for target, rel in neighbors
            if target in _NODE_BY_ID
        )
        line = f"知识：{node['name']}——{desc}"
        if related:
            line += f"；关联 {related}"
        lines.append(line)
    return lines


def build_context(
    query: str,
    snapshot: dict[str, Any],
    *,
    scenario: str | None = None,
    focus_device: str | None = None,
) -> str:
    """拼出「当前态势」文本块，作为 user 消息的前半段。"""
    scenario_name = SCENARIOS.get(scenario or "", {}).get("name") if scenario else None
    header = f"场景：{scenario_name or '常态运行'}；服务器时间：{snapshot.get('server_time') or '未知'}。"

    blocks: list[str] = [header]
    blocks.extend(_device_lines(snapshot, focus_device))
    blocks.extend(_knowledge_lines(_match_nodes(query)))

    text = "\n".join(blocks)
    if len(text) > MAX_CONTEXT_CHARS:
        text = text[:MAX_CONTEXT_CHARS] + "…（已截断）"
    return text
