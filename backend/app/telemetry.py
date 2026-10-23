from __future__ import annotations

import copy
import logging
import threading
import time
from collections import deque
from datetime import datetime
from typing import Any

from .config import settings
from .data import (
    DEVICES,
    DEVICE_BY_ID,
    SCENARIOS,
    compute_reading,
    compute_stats,
    clock,
    derive_status,
    initial_events,
    iso,
    now_local,
    seed_history,
    trend_point,
    build_alerts,
)
from .mqtt_bridge import MQTTBridge


logger = logging.getLogger(__name__)

SCENARIO_EVENT_TEXT = {
    "normal": [
        "GW-02 完成本轮 CoAP 设备轮询，平均时延 18 ms",
        "UAV-01 任务进度更新，影像回传正常",
        "高分六号影像切片完成，时空索引已更新",
        "流式计算窗口触发，区域指标已更新",
    ],
    "storm": [
        "WQ-01 水位连续 3 个周期超过警戒阈值",
        "SL-03 位移速率触发地质灾害规则",
        "无人机编队进入待命状态，链路保持在线",
        "下游断面加密监测任务已下发",
    ],
    "fire": [
        "UAV-02 热成像画面进入实时识别通道",
        "烟火识别模型检出疑似烟点，等待复核",
        "林区气象站数据刷新，湿度持续下降",
        "应急指挥席位已接入一张图态势",
    ],
    "pollution": [
        "WQ-04 排口数据触发排污异常规则",
        "USV-01 完成 2 个断面水样采集",
        "污染扩散模型完成首轮推演",
        "排口视频片段已关联至告警证据链",
    ],
}


class TelemetryStore:
    def __init__(self, scenario_key: str, running: bool) -> None:
        now = now_local()
        env = SCENARIOS[scenario_key]["environment"]
        self.lock = threading.RLock()
        self.scenario_key = scenario_key
        self.running = running
        self.speed = 1
        self.tick = 0
        self.sim_time = now
        self.readings: dict[str, dict[str, float]] = {}
        self.reading_ts: dict[str, datetime] = {}
        self.alerts = build_alerts(scenario_key, now)
        self.events: deque[dict[str, Any]] = deque(initial_events(now), maxlen=8)
        self.history = seed_history(
            now,
            env,
            settings.history_size,
            settings.history_interval_seconds,
        )
        self.last_history_at = now
        self.last_ingest_at: datetime | None = None

    def ingest(self, payload: dict[str, Any]) -> None:
        device_id = payload.get("device_id")
        metrics = payload.get("metrics")
        if not device_id or not isinstance(metrics, dict) or device_id not in DEVICE_BY_ID:
            return
        raw_ts = payload.get("ts")
        try:
            timestamp = datetime.fromisoformat(raw_ts) if raw_ts else now_local()
        except ValueError:
            timestamp = now_local()
        with self.lock:
            self.readings[device_id] = metrics
            self.reading_ts[device_id] = timestamp
            self.last_ingest_at = now_local()

    def record_tick(self, now: datetime, readings: dict[str, dict[str, float]]) -> None:
        env = SCENARIOS[self.scenario_key]["environment"]
        with self.lock:
            self.tick += 1
            self.sim_time = now
            self.readings = readings
            self.reading_ts = {device_id: now for device_id in readings}
            if (now - self.last_history_at).total_seconds() >= settings.history_interval_seconds:
                self.history = self.history[-(settings.history_size - 1) :]
                self.history.append(trend_point(now, env, self.tick))
                self.last_history_at = now
            if self.tick % 9 == 0:
                templates = SCENARIO_EVENT_TEXT.get(self.scenario_key, SCENARIO_EVENT_TEXT["normal"])
                self.add_event(templates[self.tick % len(templates)], "data", now)

    def add_event(self, text: str, event_type: str, when: datetime | None = None) -> None:
        timestamp = when or now_local()
        self.events.appendleft(
            {
                "id": f"evt-{int(timestamp.timestamp() * 1000)}-{self.tick}",
                "ts": timestamp,
                "time": clock(timestamp),
                "text": text,
                "type": event_type,
            }
        )

    def apply_scenario(self, key: str) -> None:
        now = now_local()
        with self.lock:
            self.scenario_key = key
            self.alerts = build_alerts(key, now)
            self.add_event(
                f"场景切换：{SCENARIOS[key]['name']}，仿真引擎注入 {len(SCENARIOS[key]['environment'])} 组环境参数",
                "ai",
                now,
            )

    def cycle_alert(self, alert_id: str) -> bool:
        next_status = {"待处置": "处置中", "处置中": "已完成", "已完成": "待处置"}
        now = now_local()
        with self.lock:
            for alert in self.alerts:
                if alert["id"] == alert_id:
                    alert["status"] = next_status.get(alert["status"], "待处置")
                    self.add_event(f"人工操作：{alert['title']} 状态已更新", "alert", now)
                    return True
        return False

    def latest_for_persistence(self) -> tuple[dict[str, dict[str, float]], dict[str, datetime], list[dict[str, Any]]]:
        with self.lock:
            return (
                copy.deepcopy(self.readings),
                dict(self.reading_ts),
                copy.deepcopy(self.alerts),
            )

    def snapshot(self, mqtt: MQTTBridge) -> dict[str, Any]:
        now = now_local()
        with self.lock:
            statuses = {
                device["id"]: derive_status(
                    device,
                    self.readings.get(device["id"], {}),
                    self.scenario_key,
                )
                for device in DEVICES
            }
            stats = compute_stats(statuses, self.readings, self.alerts, self.tick, self.scenario_key)
            alerts = [
                {
                    **alert,
                    "ts": iso(alert["ts"]),
                }
                for alert in self.alerts
            ]
            events = [
                {
                    "id": event["id"],
                    "time": event["time"],
                    "text": event["text"],
                    "type": event["type"],
                }
                for event in self.events
            ]
            return {
                "server_time": iso(now),
                "data_time": iso(self.sim_time),
                "scenario_key": self.scenario_key,
                "running": self.running,
                "speed": self.speed,
                "tick": self.tick,
                "readings": copy.deepcopy(self.readings),
                "statuses": statuses,
                "history": copy.deepcopy(self.history),
                "alerts": alerts,
                "events": events,
                "stats": stats,
                "mqtt": mqtt.status(),
            }


class TelemetryService:
    def __init__(self, scenario_key: str = "normal", running: bool = True) -> None:
        self.store = TelemetryStore(scenario_key, running)
        self.mqtt = MQTTBridge(on_reading=self.store.ingest)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._started_at = time.time()
        # Populate immediately so the first API request has real values.
        self._simulate_once()

    def _simulate_once(self) -> None:
        now = now_local()
        scenario = SCENARIOS[self.store.scenario_key]
        readings = {
            device["id"]: compute_reading(device, self.store.tick + 1, scenario)
            for device in DEVICES
        }
        self.store.record_tick(now, readings)
        stamp = iso(now)
        for device_id, metrics in readings.items():
            self.mqtt.publish_reading(device_id, stamp, self.store.scenario_key, metrics)

    def _run(self) -> None:
        while not self._stop.is_set():
            started = time.monotonic()
            try:
                if self.store.running:
                    self._simulate_once()
            except Exception:  # noqa: BLE001
                logger.exception("Simulation tick failed")
            elapsed = time.monotonic() - started
            self._stop.wait(max(0.05, settings.simulation_interval_seconds - elapsed))

    def start(self) -> None:
        self.mqtt.start()
        if self._thread is None:
            self._thread = threading.Thread(target=self._run, name="iot-simulator", daemon=True)
            self._thread.start()
        logger.info("Telemetry service started (scenario=%s)", self.store.scenario_key)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
        self.mqtt.stop()
        logger.info("Telemetry service stopped")

    def snapshot(self) -> dict[str, Any]:
        return self.store.snapshot(self.mqtt)

    def set_scenario(self, key: str) -> dict[str, Any]:
        if key not in SCENARIOS:
            raise ValueError(f"unknown scenario: {key}")
        self.store.apply_scenario(key)
        for alert in self.store.alerts:
            self.mqtt.publish_alert(alert)
        return self.snapshot()

    def set_running(self, running: bool) -> dict[str, Any]:
        self.store.running = bool(running)
        self.store.add_event("人工操作：仿真数据流" + ("恢复" if running else "暂停"), "task")
        return self.snapshot()

    def set_speed(self, speed: int) -> dict[str, Any]:
        # The server clock stays aligned with local time; speed is fixed at 1x.
        self.store.speed = 1
        return self.snapshot()

    def cycle_alert(self, alert_id: str) -> dict[str, Any]:
        self.store.cycle_alert(alert_id)
        return self.snapshot()

    def get_alerts(self) -> list[dict[str, Any]]:
        with self.store.lock:
            return [
                {**alert, "ts": iso(alert["ts"])}
                for alert in self.store.alerts
            ]

    def health(self) -> dict[str, Any]:
        return {
            "running": self.store.running,
            "scenario": self.store.scenario_key,
            "tick": self.store.tick,
            "uptimeSeconds": round(time.time() - self._started_at, 1),
            "mqtt": self.mqtt.status(),
        }

    def latest_for_persistence(self):
        return self.store.latest_for_persistence()
