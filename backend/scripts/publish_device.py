#!/usr/bin/env python3
"""External device publisher: exercises the reserved ingest interface.

Publishes telemetry to MQTT/TLS exactly the way a real device would,
without touching the backend process. Pair with ingest-only mode for an
end-to-end check:

    IOT_SIMULATION_ENABLED=false ./run.sh                              # terminal 1
    .venv/bin/python scripts/publish_device.py --device WQ-01 --seconds 30  # terminal 2

Any device registered in app/data/devices.json can be selected; metric keys
come from the device's metric definitions and values drift around the
"normal" scenario environment.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import ssl
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

import paho.mqtt.client as mqtt  # noqa: E402

from app.config import settings  # noqa: E402
from app.data import DEVICE_SEED, SCENARIOS  # noqa: E402

ENV = SCENARIOS["normal"]["environment"]
ENV_KEY = {
    "temperature": "temperature",
    "humidity": "humidity",
    "pm25": "pm25",
    "ph": "ph",
    "turbidity": "turbidity",
    "ammonia": "ammonia",
    "level": "waterLevel",
    "moisture": "soilMoisture",
}
FALLBACK = {
    "pm10": ENV["pm25"] * 1.6,
    "oxygen": 8.6,
    "soilTemperature": ENV["temperature"] - 1.6,
    "ec": 380,
    "displacement": 2.4,
    "crack": 0.9,
    "tilt": 0.32,
    "battery": 87,
    "signal": 92,
    "aiEvents": 0,
    "connected": 9,
    "latency": 17,
    "throughput": 1210,
    "speed": 8.2,
    "altitude": 110,
    "progress": 45,
    "cloud": 12,
    "resolution": 2,
}


def base_value(key: str) -> float:
    env_key = ENV_KEY.get(key)
    if env_key:
        return float(ENV[env_key])
    return float(FALLBACK.get(key, 10.0))


def drift(key: str) -> float:
    return max(0.02, abs(base_value(key)) * 0.03)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--device", default="WQ-01", help="device id from app/data/devices.json")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between publications")
    parser.add_argument("--seconds", type=float, default=0.0, help="stop after N seconds (0 = until Ctrl+C)")
    parser.add_argument("--host", default=settings.mqtt_host)
    parser.add_argument("--port", type=int, default=settings.mqtt_port)
    args = parser.parse_args()

    device = next((d for d in DEVICE_SEED["devices"] if d["id"] == args.device), None)
    if device is None:
        print(f"unknown device {args.device!r}; pick one of:", ", ".join(d["id"] for d in DEVICE_SEED["devices"]))
        return 2
    keys = [m["key"] for m in device.get("metrics", [])] or ["battery", "signal"]

    connected = threading.Event()
    state = {"ok": False, "reason": ""}

    def on_connect(client, userdata, flags, reason_code, properties) -> None:
        state["ok"] = not getattr(reason_code, "is_failure", True)
        state["reason"] = str(reason_code)
        connected.set()

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"device-publisher-{os.getpid()}",
        protocol=mqtt.MQTTv311,
    )
    if settings.mqtt_username:
        client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
    if settings.mqtt_tls:
        client.tls_set(ca_certs=settings.mqtt_ca_certs, tls_version=ssl.PROTOCOL_TLS_CLIENT)
    client.on_connect = on_connect
    client.connect_async(args.host, args.port, keepalive=30)
    client.loop_start()
    if not connected.wait(10) or not state["ok"]:
        print(f"unable to connect to {args.host}:{args.port}: {state['reason'] or 'timeout'}")
        client.loop_stop()
        return 1

    topic = f"{settings.mqtt_topic_prefix}/devices/{device['id']}/telemetry"
    print(f"publishing {device['id']} ({device['name']}) -> {topic} every {args.interval}s (Ctrl+C to stop)")
    started = time.time()
    published = 0
    try:
        while args.seconds <= 0 or time.time() - started < args.seconds:
            published += 1
            metrics = {
                key: round(base_value(key) + math.sin(published / 7 + published % 5) * drift(key), 2)
                for key in keys
            }
            payload = {
                "version": 1,
                "device_id": device["id"],
                "ts": datetime.now().astimezone().isoformat(timespec="milliseconds"),
                "scenario": "normal",
                "metrics": metrics,
            }
            info = client.publish(topic, json.dumps(payload, ensure_ascii=False), qos=1)
            if info.rc != mqtt.MQTT_ERR_SUCCESS:
                print(f"publish failed: rc={info.rc}")
            print(f"  [{published}] {metrics}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()
    print(f"done: {published} messages published")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
