import asyncio
import os
from pathlib import Path
import shutil
import subprocess
from unittest.mock import AsyncMock

import pytest

from app.main import ConnectionManager, persist_telemetry
from app.telemetry import TelemetryService


async def test_broadcast_removes_broken_client_without_blocking_healthy_clients():
    manager = ConnectionManager()
    healthy, broken = AsyncMock(), AsyncMock()
    broken.send_json.side_effect = RuntimeError('disconnected')
    await manager.connect(healthy, 1, float("inf"))
    await manager.connect(broken, 2, float("inf"))
    await manager.broadcast({'tick': 1})
    healthy.send_json.assert_awaited_once_with({'tick': 1})
    assert broken not in manager.active
    assert healthy in manager.active
    await manager.close_user(1)
    healthy.close.assert_awaited_once()
    assert not manager.active


async def test_failed_persistence_does_not_advance_dedupe_checkpoint(monkeypatch):
    from app import main
    service = TelemetryService()
    session = AsyncMock()
    session.commit.side_effect = RuntimeError('test database commit failure')
    context = AsyncMock()
    context.__aenter__.return_value = session
    monkeypatch.setattr(main, 'SessionLocal', lambda: context)
    checkpoint = {}
    with pytest.raises(RuntimeError):
        await persist_telemetry(service, checkpoint)
    assert checkpoint == {}


@pytest.fixture
def launcher(tmp_path):
    # Copy only the launcher; never run the original against developer .env/certificates.
    script = tmp_path / 'run.sh'
    shutil.copy(Path(__file__).resolve().parents[2] / 'backend/run.sh', script)
    python = tmp_path / 'fake-python'
    log = tmp_path / 'argv'
    python.write_text('#!/bin/bash\nif [[ "$1" == "-c" ]]; then exit 0; fi\nprintf "%s\\n" "$@" > "$TEST_ARGV"\n')
    python.chmod(0o755)
    env = {k: v for k, v in os.environ.items() if not k.startswith('IOT_') and k != 'CONDA_PREFIX'}
    # Do not probe a host Conda installation while testing the fake interpreter.
    env.update(PATH='/usr/bin:/bin', HOME=str(tmp_path), IOT_PYTHON=str(python), IOT_MQTT_ENABLED='false', TEST_ARGV=str(log))
    return script, env, log


def run_launcher(script, env):
    try:
        return subprocess.run(['bash', '-x', str(script)], env=env, capture_output=True, text=True, timeout=10)
    except subprocess.TimeoutExpired as exc:
        pytest.fail(f'Launcher timed out; shell trace: {(exc.stderr or b"")[-4000:]!r}')


def test_launcher_refuses_tls_without_certificates(launcher):
    script, env, log = launcher
    result = run_launcher(script, {**env, 'IOT_TLS_ENABLED': 'true'})
    assert result.returncode != 0
    assert '拒绝以明文降级' in result.stderr
    assert not log.exists()


def test_launcher_environment_port_precedence_and_no_shell_eval(launcher):
    script, env, log = launcher
    marker = script.parent / 'should-not-exist'
    (script.parent / '.env').write_text(f'IOT_API_PORT=8123\nIOT_MQTT_ENABLED=false\nIOT_TLS_ENABLED=false\nEVIL=$(touch {marker})\n')
    result = run_launcher(script, {**env, 'IOT_API_PORT': '8027'})
    assert result.returncode == 0, result.stderr
    args = log.read_text().splitlines()
    assert args[args.index('--port') + 1] == '8027'
    assert '--no-proxy-headers' in args
    assert not marker.exists()


def test_launcher_reads_quoted_dotenv_port(launcher):
    script, env, log = launcher
    (script.parent / '.env').write_text('IOT_API_PORT="8123"\r\nIOT_TLS_ENABLED=false\n')
    result = run_launcher(script, env)
    assert result.returncode == 0, result.stderr
    args = log.read_text().splitlines()
    assert args[args.index('--port') + 1] == '8123'


async def test_expired_socket_does_not_receive_broadcast(monkeypatch):
    from app import main
    monkeypatch.setattr(main.time, 'time', lambda: 1000)
    manager = ConnectionManager()
    expired, live = AsyncMock(), AsyncMock()
    await manager.connect(expired, 1, 1000)
    await manager.connect(live, 2, 1001)
    await manager.broadcast({'tick': 1})
    expired.send_json.assert_not_awaited()
    expired.close.assert_awaited_once_with(code=4401, reason='session expired')
    live.send_json.assert_awaited_once_with({'tick': 1})
    assert expired not in manager.active


async def test_scenario_commit_failure_preserves_runtime_and_published_alerts(monkeypatch):
    from app import main
    from types import SimpleNamespace
    service = TelemetryService()
    monkeypatch.setattr(service.mqtt, 'publish_alert', lambda alert: pytest.fail('must not publish on failed commit'))
    monkeypatch.setattr(main.app.state, 'service', service, raising=False)
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(key='normal', updated_at=None)
    session.commit.side_effect = RuntimeError('db failure')
    with pytest.raises(RuntimeError):
        await main.set_scenario('storm', session=session, _operator=None)
    assert service.store.scenario_key == 'normal'
    assert service.snapshot()['scenario_key'] == 'normal'


async def test_cancelled_scenario_keeps_lock_until_committed_apply_finishes(monkeypatch):
    from app import main
    from types import SimpleNamespace
    from threading import Event
    entered, release = Event(), Event()
    state = SimpleNamespace(key='normal', updated_at=None)
    class Session:
        async def get(self, *_args): return state
        async def commit(self): pass
    class Service:
        scenario = 'normal'
        def set_scenario(self, key):
            if key == 'storm':
                entered.set()
                assert release.wait(5)
            self.scenario = key
            return {'scenario_key': key}
    service = Service()
    monkeypatch.setattr(main.app.state, 'service', service, raising=False)
    monkeypatch.setattr(main, '_scenario_lock', asyncio.Lock())
    first = asyncio.create_task(main.set_scenario('storm', session=Session(), _operator=None))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        first.cancel()
        second = asyncio.create_task(main.set_scenario('fire', session=Session(), _operator=None))
        await asyncio.sleep(0.05)
        assert not second.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await first
        assert (await second)['scenario_key'] == 'fire'
        assert state.key == service.scenario == 'fire'
    finally:
        release.set()


async def test_socket_does_not_send_initial_snapshot_after_expiry(monkeypatch):
    import time
    from app import main
    from types import SimpleNamespace
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(active=True, token_version=2)
    context = AsyncMock()
    context.__aenter__.return_value = session
    monkeypatch.setattr(main, 'SessionLocal', lambda: context)
    monkeypatch.setattr(main, 'consume_ws_ticket', lambda _ticket: (1, 2, time.time() + 0.08))
    def slow_snapshot():
        time.sleep(0.25)
        return {'tick': 1}
    monkeypatch.setattr(main.app.state, 'service', SimpleNamespace(snapshot=slow_snapshot), raising=False)
    manager = ConnectionManager()
    monkeypatch.setattr(main.app.state, 'manager', manager, raising=False)
    socket = AsyncMock()
    socket.query_params = {'ticket': 'test-only'}
    await main.telemetry_socket(socket)
    socket.send_json.assert_not_awaited()
    socket.close.assert_awaited_once_with(code=4401, reason='session expired')
    assert socket not in manager.active


async def test_unverified_socket_cannot_receive_broadcast_or_reactivate_after_logout():
    manager = ConnectionManager()
    socket = AsyncMock()
    await manager.connect(socket, 1, float('inf'), ready=False)
    await manager.broadcast({'tick': 1})
    socket.send_json.assert_not_awaited()
    await manager.close_user(1)
    assert not manager.activate(socket)


async def test_slow_broadcast_is_cancelled_at_session_expiry():
    import time
    delivered = []
    class SlowSocket:
        async def accept(self): pass
        async def send_json(self, payload):
            await asyncio.sleep(0.2)
            delivered.append(payload)
        async def close(self, **_kwargs): pass
    manager = ConnectionManager()
    socket = SlowSocket()
    await manager.connect(socket, 1, time.time() + 0.05)
    await manager.broadcast({'tick': 1})
    assert delivered == []
    assert socket not in manager.active


async def test_simulation_state_commit_failure_does_not_change_runtime(monkeypatch):
    from app import main
    from types import SimpleNamespace
    service = TelemetryService()
    monkeypatch.setattr(main.app.state, 'service', service, raising=False)
    session = AsyncMock()
    session.get.return_value = SimpleNamespace(running=True, speed=1, updated_at=None)
    session.commit.side_effect = RuntimeError('db failure')
    with pytest.raises(RuntimeError):
        await main.update_simulation_state(main.SimulationStateUpdate(running=False), session=session, _operator=None)
    assert service.store.running is True


async def test_cancel_during_scenario_commit_keeps_state_changes_serialized(monkeypatch):
    from app import main
    from types import SimpleNamespace
    entered, release = asyncio.Event(), asyncio.Event()
    state = SimpleNamespace(key='normal', updated_at=None)
    class Session:
        def __init__(self, slow=False): self.slow = slow
        async def get(self, *_args): return state
        async def commit(self):
            if self.slow:
                entered.set()
                await release.wait()
    class Service:
        scenario = 'normal'
        def set_scenario(self, key):
            self.scenario = key
            return {'scenario_key': key}
    service = Service()
    monkeypatch.setattr(main.app.state, 'service', service, raising=False)
    monkeypatch.setattr(main, '_scenario_lock', asyncio.Lock())
    first = asyncio.create_task(main.set_scenario('storm', session=Session(slow=True), _operator=None))
    await asyncio.wait_for(entered.wait(), 2)
    first.cancel()
    second = asyncio.create_task(main.set_scenario('fire', session=Session(), _operator=None))
    try:
        await asyncio.sleep(0.05)
        assert not second.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await first
        assert (await second)['scenario_key'] == 'fire'
        assert state.key == service.scenario == 'fire'
    finally:
        release.set()
