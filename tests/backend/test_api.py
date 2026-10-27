"""Real ASGI + PostGIS integration. Never substitutes SQLite for spatial/locking behavior."""
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.engine import make_url
from starlette.websockets import WebSocketDisconnect

pytestmark = pytest.mark.integration


@pytest.fixture(scope='module')
def client():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Set TEST_DATABASE_URL to the dedicated iot_regression_test database; npm run test:all requires it')
    if make_url(url).database != 'iot_regression_test':
        pytest.fail('Refusing destructive setup: test database must be named exactly iot_regression_test')
    from app.main import app
    from regression_support import isolated_lifespan

    original = app.router.lifespan_context
    app.router.lifespan_context = isolated_lifespan
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.router.lifespan_context = original


def login(client, role='operator'):
    response = client.post('/api/auth/login', json={'username': role, 'password': f'regression-{role}-only'})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def new_plan(client, headers):
    routes = client.get('/api/drone/routes', headers=headers).json()['items']
    response = client.post('/api/drone/plans', headers=headers, json={
        'name': 'regression-only', 'route_id': routes[0]['id'], 'device_id': routes[0]['deviceId'],
        'planned_start': '2026-10-26T12:00:00+08:00', 'planned_end': '2026-10-26T13:00:00+08:00'})
    assert response.status_code == 200, response.text
    return response.json()['id']


READ_PATHS = ['/api/bootstrap', '/api/devices', '/api/devices/WQ-01', '/api/telemetry/latest',
              '/api/telemetry/history', '/api/alerts', '/api/alerts/history', '/api/scenarios',
              '/api/geo/devices', '/api/geo/fences', '/api/graph', '/api/copilot/status',
              '/api/spatial/nearby?lng=102.111&lat=36.4935&radius=5000',
              '/api/drone/overview', '/api/drone/routes', '/api/drone/plans', '/api/drone/media',
              '/api/drone/clues', '/api/drone/models', '/api/drone/commands']


@pytest.mark.parametrize('path', READ_PATHS)
def test_read_endpoints_require_auth_and_allow_viewer(client, path):
    assert client.get(path).status_code == 401
    response = client.get(path, headers=login(client, 'viewer'))
    assert response.status_code == 200, response.text
    assert response.headers['x-content-type-options'] == 'nosniff'


@pytest.mark.parametrize('method,path,payload', [
    ('post', '/api/scenarios/fire', {}), ('post', '/api/simulation/state', {'running': False}),
    ('post', '/api/alerts/normal-1/ack', {}),
    ('post', '/api/drone/routes', {'name': 'test', 'waypoints': [{'lng': 102, 'lat': 36}, {'lng': 102.1, 'lat': 36.1}]}),
    ('put', '/api/drone/routes/missing', {'name': 'test', 'waypoints': [{'lng': 102, 'lat': 36}, {'lng': 102.1, 'lat': 36.1}]}),
    ('delete', '/api/drone/routes/missing', None),
    ('post', '/api/drone/plans', {'name': 'test', 'route_id': 'missing', 'planned_start': '2026-10-26T12:00:00Z', 'planned_end': '2026-10-26T13:00:00Z'}),
    ('post', '/api/drone/plans/missing/command', {'command': 'takeoff'}),
    ('patch', '/api/drone/clues/missing', {'status': '已核实'}),
])
def test_every_write_route_denies_viewer(client, method, path, payload):
    response = client.request(method.upper(), path, headers=login(client, 'viewer'), json=payload)
    assert response.status_code == 403, response.text


def test_login_failures_limit_and_demo_disable(client, monkeypatch):
    from app.config import settings
    for _ in range(settings.login_max_attempts):
        response = client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong'})
        assert response.status_code == 401
    response = client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong'})
    assert response.status_code == 429 and int(response.headers['retry-after']) > 0
    monkeypatch.setattr(settings, 'demo_login_enabled', False)
    assert client.post('/api/auth/demo-login', json={'role': 'viewer'}).status_code == 404
    assert client.get('/api/auth/demo-roles').json() == {'enabled': False, 'roles': []}


def test_logout_revokes_all_tokens_and_unused_ws_ticket(client):
    first, second = login(client, 'viewer'), login(client, 'viewer')
    ticket = client.post('/api/auth/ws-ticket', headers=first).json()['ticket']
    assert client.post('/api/auth/logout', headers=first).status_code == 200
    assert client.get('/api/auth/me', headers=first).status_code == 401
    assert client.get('/api/auth/me', headers=second).status_code == 401
    with client.websocket_connect('/ws/telemetry?ticket=' + ticket) as socket:
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 4401


def test_ws_snapshot_ticket_replay_and_logout_closes_connection(client, monkeypatch):
    from app.main import app

    async def pause_periodic_broadcast(_payload):
        # This test covers authentication, not the independent 1Hz producer.
        # An already-buffered telemetry frame can otherwise precede the close frame.
        pass

    monkeypatch.setattr(app.state.manager, 'broadcast', pause_periodic_broadcast)
    headers = login(client, 'viewer')
    ticket = client.post('/api/auth/ws-ticket', headers=headers).json()['ticket']
    with client.websocket_connect('/ws/telemetry?ticket=' + ticket) as socket:
        assert len(socket.receive_json()['readings']) == 21
        with client.websocket_connect('/ws/telemetry?ticket=' + ticket) as replay:
            with pytest.raises(WebSocketDisconnect) as error:
                replay.receive_json()
            assert error.value.code == 4401
        client.post('/api/auth/logout', headers=headers)
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 4401


def test_operator_scenario_control_and_missing_resources(client):
    headers = login(client)
    for key in ['storm', 'fire', 'pollution', 'normal']:
        result = client.post('/api/scenarios/' + key, headers=headers)
        assert result.status_code == 200 and result.json()['scenario_key'] == key
    response = client.post('/api/simulation/state', headers=headers, json={'speed': 4, 'running': False})
    assert response.json()['speed'] == 1 and response.json()['running'] is False
    assert client.post('/api/scenarios/invalid', headers=headers).status_code == 404
    assert client.post('/api/alerts/missing/ack', headers=headers).status_code == 404
    assert client.get('/api/devices/missing', headers=headers).status_code == 404
    assert client.get('/api/telemetry/history?limit=5001', headers=headers).status_code == 422
    client.post('/api/simulation/state', headers=headers, json={'running': True})


def test_route_crud_reference_guard_and_invalid_device(client):
    headers = login(client)
    payload = {'name': 'regression-route', 'device_id': 'UAV-01', 'waypoints': [
        {'lng': 102.1, 'lat': 36.49}, {'lng': 102.12, 'lat': 36.5}]}
    response = client.post('/api/drone/routes', headers=headers, json={**payload, 'device_id': 'FAKE'})
    assert response.status_code == 400
    route = client.post('/api/drone/routes', headers=headers, json=payload).json()
    response = client.put('/api/drone/routes/' + route['id'], headers=headers, json={**payload, 'name': 'updated'})
    assert response.json()['name'] == 'updated'
    assert client.delete('/api/drone/routes/' + route['id'], headers=headers).status_code == 200
    plan = new_plan(client, headers)
    plans = client.get('/api/drone/plans', headers=headers).json()['items']
    route_id = next(p['routeId'] for p in plans if p['id'] == plan)
    assert client.delete('/api/drone/routes/' + route_id, headers=headers).status_code == 409


# Expected domain behavior, independent of the implementation's transition table.
COMMANDS = {
    'takeoff': ({'未开始'}, '执行中'), 'pause': ({'执行中'}, '已暂停'),
    'resume': ({'已暂停'}, '执行中'), 'hover': ({'执行中', '已暂停'}, None),
    'return': ({'执行中', '已暂停'}, '执行中'), 'land': ({'执行中', '已暂停'}, '已完成'),
    'complete': ({'执行中', '已暂停'}, '已完成'), 'fail': ({'未开始', '执行中', '已暂停'}, '执行失败'),
}


@pytest.mark.parametrize('status', ['未开始', '执行中', '已暂停', '已完成', '执行失败'])
@pytest.mark.parametrize('command', COMMANDS)
def test_all_flight_transitions_and_audit_atomicity(client, status, command):
    from app.db import SessionLocal
    from app.models import FlightPlan, FlightCommand
    headers = login(client)
    plan_id = new_plan(client, headers)

    async def prepare():
        async with SessionLocal() as session:
            plan = await session.get(FlightPlan, plan_id)
            plan.status = status
            await session.commit()
    client.portal.call(prepare)
    response = client.post(f'/api/drone/plans/{plan_id}/command', headers=headers, json={'command': command})
    allowed, target = COMMANDS[command]
    assert response.status_code == (200 if status in allowed else 409), response.text

    async def inspect():
        async with SessionLocal() as session:
            plan = await session.get(FlightPlan, plan_id)
            count = await session.scalar(select(func.count()).select_from(FlightCommand).where(FlightCommand.plan_id == plan_id))
            return plan.status, count, plan.actual_start, plan.actual_end
    actual_status, count, start, end = client.portal.call(inspect)
    assert actual_status == ((target or status) if status in allowed else status)
    assert count == (1 if status in allowed else 0)
    if status in allowed:
        if command in {'takeoff', 'resume', 'return'}:
            assert start is not None and end is None
        if command in {'land', 'complete', 'fail'}:
            assert end is not None


def test_concurrent_takeoff_only_one_audit_row(client):
    from app.db import SessionLocal
    from app.models import FlightCommand
    headers = login(client)
    plan_id = new_plan(client, headers)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post(f'/api/drone/plans/{plan_id}/command', headers=headers, json={'command': 'takeoff'}), range(2)))
    assert sorted(r.status_code for r in responses) == [200, 409]
    async def count_audits():
        async with SessionLocal() as session:
            return await session.scalar(select(func.count()).select_from(FlightCommand).where(FlightCommand.plan_id == plan_id))
    assert client.portal.call(count_audits) == 1


def test_persistence_idempotence_history_and_postgis(client):
    from app.main import persist_telemetry
    from app.db import SessionLocal
    from app.models import Reading
    service = client.app.state.service
    headers = login(client, 'viewer')

    async def persist():
        # Pause ticks so the second call repeats exactly the same timestamps.
        service.store.running = False
        await persist_telemetry(service, {})
        async with SessionLocal() as session:
            before = await session.scalar(select(func.count()).select_from(Reading))
        await persist_telemetry(service, {})  # exercises DB unique constraint, not just in-memory dedupe
        async with SessionLocal() as session:
            after = await session.scalar(select(func.count()).select_from(Reading))
        return before, after
    before, after = client.portal.call(persist)
    assert before >= 21 and after == before
    history = client.get('/api/telemetry/history?device_id=WQ-01', headers=headers).json()
    assert history['count'] > 0
    assert all(row['deviceId'] == 'WQ-01' for row in history['items'])
    device = client.get('/api/devices/WQ-01', headers=headers).json()
    nearby = client.get('/api/spatial/nearby', headers=headers, params={'lng': device['lng'], 'lat': device['lat'], 'radius': 100}).json()
    assert any(row['id'] == 'WQ-01' and float(row['distance_m']) == 0 for row in nearby['items'])
    assert client.get('/api/health').json()['database'] == 'ok'


def test_copilot_validation_fallback_and_host_security(client):
    headers = login(client, 'viewer')
    assert client.post('/api/copilot/chat', headers=headers, json={'query': ''}).status_code == 422
    assert client.post('/api/copilot/chat', headers=headers, json={'query': 'x' * 301}).status_code == 422
    assert client.post('/api/copilot/chat', headers=headers, json={'query': '当前风险'}).status_code == 503
    assert client.get('/api', headers={'host': 'evil.example'}).status_code == 400
