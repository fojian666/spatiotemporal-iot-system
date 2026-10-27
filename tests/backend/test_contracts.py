import json
import math
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.config import settings
from app.data import DEVICES, SCENARIOS, compute_reading, metric_state
from app.mqtt_bridge import MQTTBridge, topic_device_id
from app.schemas import DeviceReadingPayload
from app.telemetry import TelemetryService


@pytest.mark.parametrize('bad', [float('nan'), float('inf'), -float('inf'), 'not-a-number', None, {}, []])
def test_non_numeric_metrics_rejected(bad):
    with pytest.raises(ValidationError):
        DeviceReadingPayload(device_id='WQ-01', metrics={'ph': bad})


@pytest.mark.parametrize('metrics', [{'': 1}, {'x' * 41: 1}, {str(i): i for i in range(33)}])
def test_metric_limits(metrics):
    with pytest.raises(ValidationError):
        DeviceReadingPayload(device_id='WQ-01', metrics=metrics)


def test_schema_allows_extensible_metrics_and_ignores_extensions():
    payload = DeviceReadingPayload(device_id='WQ-01', metrics={'custom': 0}, extension=True)
    assert payload.version == 1
    assert payload.metrics == {'custom': 0}
    assert 'extension' not in payload.model_dump()


@pytest.mark.parametrize('topic', ['', 'iot/other/devices/WQ-01/telemetry', 'iot/pingan/devices/a/b/telemetry', 'iot/pingan/devices//telemetry', 'iot/pingan/devices/WQ-01/alerts'])
def test_topic_rejections(topic):
    assert topic_device_id(topic) is None


@pytest.mark.parametrize('raw,topic', [
    (b'bad-json', 'iot/pingan/devices/WQ-01/telemetry'),
    (b'\xff', 'iot/pingan/devices/WQ-01/telemetry'),
    (b'[]', 'iot/pingan/devices/WQ-01/telemetry'),
    (json.dumps({'device_id': 'WQ-02', 'metrics': {'ph': 7}}).encode(), 'iot/pingan/devices/WQ-01/telemetry'),
    (json.dumps({'device_id': 'FAKE', 'metrics': {'ph': 7}}).encode(), 'iot/pingan/devices/FAKE/telemetry'),
    (b'{"device_id":"WQ-01","metrics":{"ph":NaN}}', 'iot/pingan/devices/WQ-01/telemetry'),
])
def test_bridge_rejections_do_not_ingest(raw, topic):
    ingested = []
    bridge = MQTTBridge(ingested.append)
    bridge._on_message(None, None, SimpleNamespace(topic=topic, payload=raw))
    assert ingested == []
    assert bridge.messages_rejected == 1
    assert bridge.messages_received == 0


def test_bridge_accepts_valid_device_and_tracks_count():
    ingested = []
    bridge = MQTTBridge(ingested.append)
    bridge._on_message(None, None, SimpleNamespace(
        topic='iot/pingan/devices/WQ-01/telemetry',
        payload=b'{"device_id":"WQ-01","metrics":{"ph":7.2}}'))
    assert ingested[0]['metrics'] == {'ph': 7.2}
    assert bridge.messages_received == 1
    assert bridge.messages_rejected == 0


@pytest.mark.parametrize('scenario', SCENARIOS)
def test_all_devices_produce_finite_values(scenario):
    for device in DEVICES:
        for tick in [0, 1, 120, 10000]:
            reading = compute_reading(device, tick, SCENARIOS[scenario])
            assert reading
            assert all(math.isfinite(v) for v in reading.values())


@pytest.mark.parametrize('direction,warn,crit,checks', [
    ('high', 10, 20, [(9, 'normal'), (10, 'warning'), (20, 'critical')]),
    ('low', 10, 5, [(11, 'normal'), (10, 'warning'), (5, 'critical')]),
    ('range', 8.5, 9, [(7, 'normal'), (8.5, 'normal'), (8.6, 'warning'), (9.1, 'critical'), (5.9, 'warning'), (5, 'critical')]),
])
def test_threshold_boundaries(direction, warn, crit, checks):
    for value, expected in checks:
        assert metric_state(dict(direction=direction, warn=warn, crit=crit, low=6), value) == expected


def test_live_mode_starts_empty_and_only_reported_device_is_online(monkeypatch):
    monkeypatch.setattr(settings, 'simulation_enabled', False)
    service = TelemetryService()
    snapshot = service.snapshot()
    assert snapshot['history'] == [] and snapshot['readings'] == {}
    assert set(snapshot['statuses'].values()) == {'offline'}
    service.store.ingest({'device_id': 'WT-01', 'metrics': {'temperature': 20, 'humidity': 50, 'wind': 2, 'pm25': 10}})
    service.store.sample_real_history()
    snapshot = service.snapshot()
    assert snapshot['statuses']['WT-01'] == 'online'
    assert snapshot['statuses']['WQ-01'] == 'offline'
    assert snapshot['history'][-1]['temperature'] == 20
    assert snapshot['stats']['avgTemperature'] == 20  # missing devices must not dilute the average


def test_snapshot_and_persistence_are_isolated_copies():
    service = TelemetryService()
    snapshot = service.snapshot()
    snapshot['readings']['WQ-01']['ph'] = -1
    readings, timestamps, alerts = service.latest_for_persistence()
    readings.clear()
    timestamps.clear()
    alerts[0]['status'] = 'wrong'
    assert service.snapshot()['readings']['WQ-01']['ph'] > 0
    assert service.snapshot()['alerts'][0]['status'] != 'wrong'


def test_server_speed_fixed_and_alert_cycle_history_bounded():
    service = TelemetryService()
    assert service.set_speed(4)['speed'] == 1
    for key in SCENARIOS:
        service.set_scenario(key)
        alert = service.snapshot()['alerts'][0]
        for _ in range(3):
            service.cycle_alert(alert['id'])
        assert service.snapshot()['alerts'][0]['status'] == alert['status']
    for _ in range(100):
        service.store.add_event('test', 'data')
    assert len(service.snapshot()['events']) == 8
    assert not service.store.cycle_alert('missing')
    with pytest.raises(ValueError):
        service.set_scenario('invalid')


def test_finite_large_readings_do_not_break_aggregate_rounding():
    from app.data import _fixed, compute_stats
    assert _fixed(1e100, 2) == 1e100
    assert _fixed(-1e100, 1) == -1e100
    metrics = DeviceReadingPayload(device_id='WT-01', metrics={'temperature': 1e100}).metrics
    result = compute_stats({'WT-01': 'warning'}, {'WT-01': metrics}, [], 0, 'normal')
    assert result['avgTemperature'] == 1e100
