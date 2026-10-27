from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .config import settings

DATA_DIR = Path(__file__).resolve().parent / "data"

with (DATA_DIR / "devices.json").open(encoding="utf-8") as handle:
    DEVICE_SEED = json.load(handle)
with (DATA_DIR / "scenarios.json").open(encoding="utf-8") as handle:
    SCENARIOS = json.load(handle)
with (DATA_DIR / "knowledge.json").open(encoding="utf-8") as handle:
    KNOWLEDGE = json.load(handle)

DEVICES: list[dict[str, Any]] = DEVICE_SEED["devices"]
DEVICE_BY_ID: dict[str, dict[str, Any]] = {device["id"]: device for device in DEVICES}
ROUTES = DEVICE_SEED.get("routes", {})
FENCES = DEVICE_SEED.get("fences", [])
CENTER = DEVICE_SEED.get("center", [102.111, 36.4935])

TZ = ZoneInfo(settings.timezone)
UNMANNED_KINDS = {"drone", "ugv", "usv", "satellite"}
WATER_IDS = {"WQ-01", "WQ-02", "WQ-03", "WQ-04"}


def now_local() -> datetime:
    return datetime.now(TZ)


def iso(value: datetime) -> str:
    return value.astimezone(TZ).isoformat(timespec="milliseconds")


def clock(value: datetime) -> str:
    return value.astimezone(TZ).strftime("%H:%M:%S")


def ago(now: datetime, minutes: int) -> datetime:
    return now - timedelta(minutes=minutes)


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def _fixed(value: float, digits: int = 0) -> float:
    """Match JS Number.toFixed: round the exact binary float, ties away from zero."""
    # JS switches to ordinary number formatting at this magnitude. Avoid
    # Decimal context overflow for large, but valid, external sensor values.
    if abs(value) >= 1e21:
        return value
    return float(Decimal.from_float(float(value)).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))


def _hash(text: str) -> int:
    value = 0
    for char in text:
        value = (value * 31 + ord(char)) % 9973
    return value


def _jitter(device_id: str, tick: int, amplitude: float) -> float:
    seed = _hash(device_id)
    return math.sin((tick + (seed % 31)) / 6.2 + seed) * amplitude * 0.65 + (
        ((seed % 100) - 50) / 100
    ) * amplitude


def water_weight(device_id: str) -> float:
    if device_id == "WQ-04":
        return 1.0
    if device_id == "WQ-02":
        return 0.7
    if device_id == "WQ-01":
        return 0.55
    return 0.3


def compute_reading(device: dict[str, Any], tick: int, scenario: dict[str, Any]) -> dict[str, float]:
    env = scenario["environment"]
    device_id = device["id"]
    kind = device["kind"]
    noise = _jitter(device_id, tick, 1.0)

    if kind == "weather":
        forest = device["zone"] == "峡群林场"
        return {
            "temperature": _fixed(env["temperature"] + (0.9 if forest else 0) + noise * 0.7 + math.sin(tick / 13) * 0.25, 1),
            "humidity": _fixed(clamp(env["humidity"] + (-4 if forest else 0) + noise * 3 + math.sin(tick / 11) * 1.5, 5, 100)),
            "wind": _fixed(max(0.2, env["wind"] + noise * 0.8), 1),
            "pm25": _fixed(max(1, env["pm25"] + noise * 4)),
        }
    if kind == "water":
        weight = water_weight(device_id)
        outlet = device_id == "WQ-04"
        level_offset = 0.0 if device_id == "WQ-01" else 0.7 if device_id == "WQ-03" else -0.85 if outlet else 0.08
        turbidity = 10 + env["turbidity"] * weight + (18 if outlet else 0) + noise * 2.5
        return {
            "ph": _fixed(clamp(7.2 + (env["ph"] - 7.2) * weight + noise * 0.05, 5.5, 10.5), 2),
            "turbidity": _fixed(max(1, turbidity)),
            "ammonia": _fixed(max(0.01, env["ammonia"] * weight + (0.05 if outlet else 0) + noise * 0.02), 2),
            "level": _fixed(max(0.2, env["waterLevel"] + level_offset + noise * 0.025), 2),
            "oxygen": _fixed(clamp(9.4 - turbidity / 48 - env["ammonia"] * 0.3 + noise * 0.3, 1.2, 12), 1),
        }
    if kind == "soil":
        return {
            "moisture": _fixed(clamp(env["soilMoisture"] + noise * 3.5 + math.sin(tick / 15) * 0.8, 2, 100)),
            "soilTemperature": _fixed(env["temperature"] - 1.6 + noise * 0.5, 1),
            "ec": _fixed(max(80, 420 - env["soilMoisture"] * 1.2 + noise * 45)),
        }
    if kind == "air":
        return {
            "pm25": _fixed(max(1, env["pm25"] + noise * 5)),
            "pm10": _fixed(max(2, env["pm25"] * 1.65 + noise * 8)),
            "temperature": _fixed(env["temperature"] + noise * 0.4, 1),
            "humidity": _fixed(clamp(env["humidity"] + noise * 2, 5, 100)),
        }
    if kind == "geology":
        risk = 10.4 if scenario["key"] == "storm" and device_id == "SL-03" else 4.6 if scenario["key"] == "storm" else 0.8 if scenario["key"] == "fire" else 0.0
        return {
            "displacement": _fixed(2.2 + risk + noise * 0.25, 1),
            "crack": _fixed(0.82 + risk * 0.26 + noise * 0.02, 2),
            "tilt": _fixed(0.32 + risk * 0.09 + noise * 0.008, 2),
        }
    if kind == "video":
        events = 3 if scenario["key"] == "fire" and device_id == "CAM-03" else 1 if scenario["key"] == "fire" else 2 if scenario["key"] == "storm" else 1 if scenario["key"] == "pollution" else 0
        return {"aiEvents": events}
    if kind == "drone":
        return {
            "battery": math.floor(clamp(device["battery"] - tick * 0.01, 12, 100) + 0.5),
            "altitude": _fixed(96 + math.sin(tick / 6) * 24),
            "speed": _fixed(8.4 + math.sin(tick / 5) * 1.2, 1),
            "progress": min(99, 18 + (tick * 1.2) % 80),
        }
    if kind in {"ugv", "usv"}:
        return {
            "battery": math.floor(clamp(device["battery"] - tick * 0.008, 10, 100) + 0.5),
            "speed": _fixed(2.1 + math.sin(tick / 7) * 0.6, 1),
            "progress": min(99, 34 + (tick * 0.8) % 60),
        }
    if kind == "satellite":
        return {
            "altitude": 561000,
            "resolution": 2,
            "cloud": 12,
            "progress": min(99, 22 + (tick * 0.7) % 70),
        }
    if kind == "gateway":
        return {
            "connected": 9 + (_hash(device_id) % 4),
            "latency": _fixed(16 + math.sin(tick / 9) * 3 + (11 if scenario["key"] == "storm" else 0)),
            "throughput": _fixed(1180 + math.sin(tick / 5) * 60 + (0 if scenario["key"] == "normal" else 240)),
        }
    return {}


def metric_state(definition: dict[str, Any], value: float) -> str:
    direction = definition.get("direction", "high")
    if direction == "high":
        if value >= definition["crit"]:
            return "critical"
        if value >= definition["warn"]:
            return "warning"
        return "normal"
    if direction == "low":
        if value <= definition["crit"]:
            return "critical"
        if value <= definition["warn"]:
            return "warning"
        return "normal"
    low = definition.get("low", 0)
    if value > definition["crit"] or value < low - 0.8:
        return "critical"
    if value > definition["warn"] or value < low:
        return "warning"
    return "normal"


def derive_status(device: dict[str, Any], reading: dict[str, float], scenario_key: str) -> str:
    if device.get("status") == "offline":
        return "offline"
    if not device.get("metrics"):
        return "online"
    if device["id"] == "WQ-04" and scenario_key == "normal":
        return "warning"
    status = "online"
    for definition in device["metrics"]:
        if metric_state(definition, float(reading.get(definition["key"], 0))) != "normal":
            status = "warning"
    return status


def _alert(
    alert_id: str,
    level: str,
    title: str,
    source: str,
    zone: str,
    ts: datetime,
    detail: str,
    status: str,
) -> dict[str, Any]:
    device = DEVICE_BY_ID.get(source, {})
    return {
        "id": alert_id,
        "level": level,
        "title": title,
        "source": source,
        "zone": zone,
        "ts": ts,
        "time": clock(ts),
        "detail": detail,
        "status": status,
        "lat": device.get("lat", CENTER[1]),
        "lng": device.get("lng", CENTER[0]),
    }


def build_alerts(key: str, base: datetime) -> list[dict[str, Any]]:
    if key == "storm":
        return [
            _alert("storm-1", "critical", "湟水河平安桥水位超警戒", "WQ-01", "湟水河廊道", ago(base, 3), "水位 3.91 m，超警戒 0.11 m，1h 涨幅 0.42 m；上游降雨仍在持续。", "处置中"),
            _alert("storm-2", "critical", "峡群沟位移速率异常", "SL-03", "峡群林场", ago(base, 7), "累计位移 12.7 mm，裂缝宽度 3.5 mm，触发泥石流黄色预警。", "待处置"),
            _alert("storm-3", "warning", "东沟水库水位持续上涨", "WQ-03", "东沟水库", ago(base, 12), "库水位 4.56 m，入库流量增大，建议加密巡查。", "待处置"),
            _alert("storm-4", "info", "无人机编队自动返航", "UAV-01", "平安街道", ago(base, 14), "阵风超过 10 m/s，任务自动中止，飞行器已安全返航。", "已完成"),
        ]
    if key == "fire":
        return [
            _alert("fire-1", "critical", "峡群林场发现高温热点", "UAV-02", "峡群林场", ago(base, 2), "热红外识别温差 41.8 ℃，热点已锁定在林场核心区，疑似地表火。", "处置中"),
            _alert("fire-2", "critical", "PM2.5 峰值 286 µg/m³", "AQ-01", "平安街道", ago(base, 5), "烟尘向下风向扩散，AQI 爆表，建议发布健康提示。", "待处置"),
            _alert("fire-3", "warning", "林区相对湿度降至 16%", "WT-02", "峡群林场", ago(base, 9), "气温 34.5 ℃、风速 6.8 m/s，火险气象等级五级。", "处置中"),
            _alert("fire-4", "info", "无人机切换热成像载荷", "UAV-02", "峡群林场", ago(base, 11), "航线重规划完成，正在抵近热点区域执行复核。", "已完成"),
        ]
    if key == "pollution":
        return [
            _alert("pollution-1", "critical", "污水厂排口 pH 超标", "WQ-04", "富硒产业园", ago(base, 2), "pH 9.31，超排放标准上限；浊度 186 NTU，氨氮 2.95 mg/L。", "处置中"),
            _alert("pollution-2", "critical", "下游断面氨氮异常", "WQ-02", "三合镇", ago(base, 6), "氨氮 2.08 mg/L，较基准值上升 12 倍，污染带向下游迁移。", "待处置"),
            _alert("pollution-3", "warning", "河道浊度上升 2.4 倍", "WQ-01", "湟水河廊道", ago(base, 10), "平安桥断面浊度 20 NTU，建议启动加密采样。", "待处置"),
            _alert("pollution-4", "info", "无人船采样任务已下发", "USV-01", "东沟水库", ago(base, 13), "已将排口下游 3 个断面加入采样计划。", "已完成"),
        ]
    return [
        _alert("normal-1", "warning", "污水厂排口浊度缓慢上升", "WQ-04", "富硒产业园", ago(base, 18), "近 24h 浊度由 28 NTU 升至 46 NTU，尚未超阈值，建议安排巡检。", "处置中"),
        _alert("normal-2", "info", "无人机例行巡检完成", "UAV-01", "平安街道", ago(base, 34), "湟水河航线 8 个航点全部执行完成，采集影像 126 张。", "已完成"),
        _alert("normal-3", "info", "AQ-02 设备离线", "AQ-02", "富硒产业园", ago(base, 52), "边缘网关心跳丢失，已自动生成运维工单。", "待处置"),
    ]


def initial_events(base: datetime) -> list[dict[str, Any]]:
    entries = [
        (2, "边缘节点 GW-01 完成 1,248 条消息聚合与去重", "data"),
        (5, "高分六号过境影像已入库，覆盖湟水河流域 186 km²", "data"),
        (11, "UAV-01 航线「湟水河例行巡检」执行完成", "task"),
        (18, "规则引擎识别污水厂排口浊度缓慢上升", "alert"),
        (26, "物联大模型生成《今日区域感知简报》", "ai"),
        (41, "无人船 USV-01 完成东沟水库例行采样", "task"),
    ]
    result = []
    for index, (minutes, text, kind) in enumerate(entries):
        ts = ago(base, minutes)
        result.append({"id": f"seed-{index}", "ts": ts, "time": clock(ts), "text": text, "type": kind})
    return result


def trend_point(base: datetime, environment: dict[str, float], tick: int) -> dict[str, Any]:
    wave = math.sin(tick / 4.5)
    return {
        "ts": int(base.timestamp() * 1000),
        "t": clock(base),
        "temperature": round(environment["temperature"] + wave * 0.55 + math.sin(tick / 8) * 0.25, 1),
        "humidity": round(environment["humidity"] + wave * 2.4),
        "pm25": round(environment["pm25"] + math.sin(tick / 4) * 3 + math.sin(tick / 11) * 2),
        "waterLevel": round(environment["waterLevel"] + math.sin(tick / 6) * 0.025, 2),
        "turbidity": round(environment["turbidity"] + math.sin(tick / 5) * 2.4 + math.sin(tick / 9) * 1.2),
        "ph": round(environment["ph"] + math.sin(tick / 7) * 0.02, 2),
    }


def seed_history(now: datetime, environment: dict[str, float], size: int, interval_seconds: int) -> list[dict[str, Any]]:
    start = now - timedelta(seconds=(size - 1) * interval_seconds)
    points = []
    for index in range(size):
        point_time = start + timedelta(seconds=index * interval_seconds)
        point = trend_point(point_time, environment, index)
        points.append(point)
    return points


def compute_stats(
    statuses: dict[str, str],
    readings: dict[str, dict[str, float]],
    alerts: list[dict[str, Any]],
    tick: int,
    scenario_key: str,
) -> dict[str, Any]:
    values = list(statuses.values())
    online = sum(1 for status in values if status != "offline")
    warning = sum(1 for status in values if status == "warning")
    offline = sum(1 for status in values if status == "offline")
    critical_alerts = sum(1 for alert in alerts if alert["level"] == "critical")
    active_alerts = sum(1 for alert in alerts if alert["status"] != "已完成")
    active_warning_alerts = sum(
        1 for alert in alerts if alert["level"] == "warning" and alert["status"] != "已完成"
    )
    weather = [device for device in DEVICES if device["kind"] in {"weather", "air"}]
    water = [device for device in DEVICES if device["kind"] == "water"]

    def average(items: list[float]) -> float:
        # Python 3.12+ sum() compensates float error; JS reduce() adds left to right.
        total = 0.0
        for item in items:
            total += item
        return total / max(1, len(items))

    def reported(devices: list[dict[str, Any]], key: str) -> list[float]:
        return [
            float(metrics[key])
            for device in devices
            if (metrics := readings.get(device["id"])) and key in metrics
        ]

    region_health = max(
        35,
        min(
            99,
            99
            - warning * 3
            - offline * 5
            - critical_alerts * 5
            - active_warning_alerts,
        ),
    )
    return {
        "total": len(DEVICES),
        "online": online,
        "warning": warning,
        "offline": offline,
        "onlineRate": _fixed(online / len(DEVICES) * 100, 1),
        "criticalAlerts": critical_alerts,
        "activeAlerts": active_alerts,
        "unmannedActive": sum(1 for device in DEVICES if device["kind"] in UNMANNED_KINDS),
        "regionHealth": region_health,
        "messageRate": _fixed(1280 + math.sin(tick / 5) * 48 + (0 if scenario_key == "normal" else 310)),
        "avgTemperature": _fixed(average(reported(weather, "temperature")), 1),
        "avgHumidity": math.floor(average(reported(weather, "humidity")) + 0.5),
        "avgPm25": math.floor(average(reported([device for device in weather if device["id"] != "AQ-02"], "pm25")) + 0.5),
        "avgWaterLevel": _fixed(average(reported(water, "level")), 2),
        "avgPh": _fixed(average(reported(water, "ph")), 2),
        "todayTasks": 24 + (0 if scenario_key == "normal" else 3),
        "dataQuality": 98.4 if scenario_key == "normal" else 96.7,
    }
