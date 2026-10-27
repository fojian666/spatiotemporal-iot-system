"""Actual encrypted broker round-trip; temporary certs/port never touch demo MQTT."""
import json
import shutil
import socket
import subprocess
import time
import threading

import pytest

from app.config import settings
from app.mqtt_bridge import MQTTBridge
from app.telemetry import TelemetryService

pytestmark = pytest.mark.integration


def wait_for(predicate, timeout=8):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError('Timed out waiting for isolated MQTT broker')


def test_tls_mqtt_ingest_live_history_and_rejection(tmp_path, monkeypatch):
    broker = shutil.which('mosquitto')
    if not broker:
        pytest.fail('Full regression requires mosquitto on PATH (see TESTING.md)')
    cert, key = tmp_path / 'server.crt', tmp_path / 'server.key'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
                    '-keyout', str(key), '-out', str(cert)], check=True, capture_output=True)
    with socket.socket() as candidate:
        candidate.bind(('127.0.0.1', 0))
        port = candidate.getsockname()[1]
    config = tmp_path / 'mosquitto.conf'
    config.write_text(f'listener {port} 127.0.0.1\nallow_anonymous true\ncertfile {cert}\nkeyfile {key}\n')
    process = subprocess.Popen([broker, '-c', str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    bridge = None
    try:
        monkeypatch.setattr(settings, 'simulation_enabled', False)
        monkeypatch.setattr(settings, 'mqtt_enabled', True)
        monkeypatch.setattr(settings, 'mqtt_tls', True)
        monkeypatch.setattr(settings, 'mqtt_host', '127.0.0.1')
        monkeypatch.setattr(settings, 'mqtt_port', port)
        monkeypatch.setattr(settings, 'mqtt_ca_certs', str(cert))
        monkeypatch.setattr(settings, 'mqtt_tls_insecure', False)
        service = TelemetryService()
        bridge = service.mqtt
        subscribed = threading.Event()
        bridge._sub.on_subscribe = lambda *args: subscribed.set()
        bridge.start()
        wait_for(lambda: bridge.connected and bridge._pub.is_connected() and subscribed.is_set())
        assert bridge._sub._ssl_context.verify_mode.name == 'CERT_REQUIRED'
        bridge.publish_reading('WQ-01', '2026-10-26T12:00:00+08:00', 'normal', {'ph': 7.3, 'level': 2.8})
        wait_for(lambda: bridge.messages_received == 1)
        service.store.sample_real_history()
        snapshot = service.snapshot()
        assert snapshot['readings']['WQ-01'] == {'ph': 7.3, 'level': 2.8}
        assert snapshot['statuses']['WT-01'] == 'offline'
        assert snapshot['history'][-1]['waterLevel'] == 2.8
        bridge._pub.publish('iot/pingan/devices/WQ-01/telemetry', json.dumps({'device_id': 'WQ-02', 'metrics': {'ph': 99}}), qos=1)
        wait_for(lambda: bridge.messages_rejected == 1)
        assert service.snapshot()['readings']['WQ-01']['ph'] == 7.3
        assert bridge.messages_received == 1
    finally:
        if bridge:
            bridge.stop()
        process.terminate()
        process.wait(timeout=5)
