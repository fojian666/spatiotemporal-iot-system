from __future__ import annotations

import json
import logging
import os
import ssl
import threading
from typing import Any, Callable

import paho.mqtt.client as mqtt

from .config import settings
from .schemas import DeviceReadingPayload


logger = logging.getLogger(__name__)


class MQTTBridge:
    """Local MQTT bridge: device telemetry is published to Mosquitto and then
    ingested again by the subscriber, so the API follows the real message path.
    """

    def __init__(self, on_reading: Callable[[dict[str, Any]], None]) -> None:
        self.on_reading = on_reading
        self.connected = False
        self.messages_received = 0
        self.messages_published = 0
        self.messages_rejected = 0
        self.last_error: str | None = None
        self._stop = threading.Event()
        self._pub = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"pingan-publisher-{os.getpid()}",
            protocol=mqtt.MQTTv311,
        )
        self._sub = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"pingan-subscriber-{os.getpid()}",
            protocol=mqtt.MQTTv311,
        )
        if settings.mqtt_username:
            self._pub.username_pw_set(settings.mqtt_username, settings.mqtt_password)
            self._sub.username_pw_set(settings.mqtt_username, settings.mqtt_password)
        if settings.mqtt_tls:
            for client in (self._pub, self._sub):
                client.tls_set(
                    ca_certs=settings.mqtt_ca_certs,
                    certfile=settings.mqtt_certfile,
                    keyfile=settings.mqtt_keyfile,
                    tls_version=ssl.PROTOCOL_TLS_CLIENT,
                )
                client.tls_insecure_set(settings.mqtt_tls_insecure)
        self._sub.on_connect = self._on_connect
        self._sub.on_disconnect = self._on_disconnect
        self._sub.on_message = self._on_message
        self._pub.on_connect = self._on_pub_connect

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        failed = getattr(reason_code, "is_failure", True)
        self.connected = not failed
        if self.connected:
            client.subscribe(f"{settings.mqtt_topic_prefix}/devices/+/telemetry", qos=1)
            logger.info("MQTT subscriber connected to %s:%s", settings.mqtt_host, settings.mqtt_port)
        else:
            self.last_error = str(reason_code)
            logger.warning("MQTT subscriber connection failed: %s", reason_code)

    def _on_pub_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if not getattr(reason_code, "is_failure", True):
            logger.info("MQTT publisher connected")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        self.connected = False
        logger.warning("MQTT subscriber disconnected: %s", reason_code)

    def _on_message(self, client, userdata, message) -> None:
        try:
            raw = json.loads(message.payload.decode("utf-8"))
            payload = DeviceReadingPayload.model_validate(raw)
        except Exception as exc:  # noqa: BLE001
            self.messages_rejected += 1
            logger.warning("Rejected telemetry payload on %s: %s", message.topic, exc)
            return
        self.messages_received += 1
        self.on_reading(payload.model_dump())

    def start(self) -> None:
        if not settings.mqtt_enabled:
            logger.info("MQTT disabled by configuration")
            return
        self._pub.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=30)
        self._sub.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=30)
        self._pub.loop_start()
        self._sub.loop_start()

    def publish_reading(self, device_id: str, ts: str, scenario: str, metrics: dict[str, float]) -> None:
        if not settings.mqtt_enabled:
            return
        topic = f"{settings.mqtt_topic_prefix}/devices/{device_id}/telemetry"
        payload = json.dumps(
            {"device_id": device_id, "ts": ts, "scenario": scenario, "metrics": metrics},
            ensure_ascii=False,
        )
        try:
            info = self._pub.publish(topic, payload, qos=1)
            if info.rc == mqtt.MQTT_ERR_SUCCESS:
                self.messages_published += 1
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            logger.debug("MQTT publish failed: %s", exc)

    def publish_alert(self, alert: dict[str, Any]) -> None:
        if not settings.mqtt_enabled:
            return
        topic = f"{settings.mqtt_topic_prefix}/alerts/{alert['id']}"
        payload = {
            "id": alert["id"],
            "level": alert["level"],
            "title": alert["title"],
            "source": alert["source"],
            "time": alert["time"],
        }
        try:
            self._pub.publish(topic, json.dumps(payload, ensure_ascii=False), qos=1)
        except Exception:  # noqa: BLE001
            pass

    def status(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "messagesReceived": self.messages_received,
            "messagesPublished": self.messages_published,
            "messagesRejected": self.messages_rejected,
            "lastError": self.last_error,
            "host": f"{settings.mqtt_host}:{settings.mqtt_port}",
        }

    def stop(self) -> None:
        self._stop.set()
        try:
            self._pub.loop_stop()
            self._sub.loop_stop()
            self._pub.disconnect()
            self._sub.disconnect()
        except Exception:  # noqa: BLE001
            pass
