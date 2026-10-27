"""Live Python oracle for TS parity tests; not a stale committed snapshot."""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
os.environ['IOT_MQTT_ENABLED'] = 'false'
from app.data import DEVICES, SCENARIOS, KNOWLEDGE, compute_reading, derive_status, build_alerts, compute_stats

base = datetime.fromisoformat('2026-10-26T12:00:00+08:00')
cases = []
for key, scenario in SCENARIOS.items():
    for tick in [0, 1, 7, 49, 120, 250, 350, 1000, 10000]:
        readings = {d['id']: compute_reading(d, tick, scenario) for d in DEVICES}
        statuses = {d['id']: derive_status(d, readings[d['id']], key) for d in DEVICES}
        stats = compute_stats(statuses, readings, build_alerts(key, base), tick, key)
        cases.append(dict(stats=stats, key=key, tick=tick, readings=readings,
                          statuses={d['id']: derive_status(d, readings[d['id']], key) for d in DEVICES}))
alerts = {key: [{k: v for k, v in a.items() if k not in ('ts', 'lat', 'lng')}
                for a in build_alerts(key, base)] for key in SCENARIOS}
print(json.dumps(dict(devices=DEVICES, scenarios=SCENARIOS, knowledge=KNOWLEDGE, cases=cases, alerts=alerts), ensure_ascii=False))
