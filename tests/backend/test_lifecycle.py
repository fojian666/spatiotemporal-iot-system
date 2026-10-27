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
    await manager.connect(healthy, 1)
    await manager.connect(broken, 2)
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
    env = {k: v for k, v in os.environ.items() if not k.startswith('IOT_')}
    env.update(IOT_PYTHON=str(python), IOT_MQTT_ENABLED='false', TEST_ARGV=str(log))
    return script, env, log


def test_launcher_refuses_tls_without_certificates(launcher):
    script, env, log = launcher
    result = subprocess.run(['bash', str(script)], env={**env, 'IOT_TLS_ENABLED': 'true'}, capture_output=True, text=True, timeout=10)
    assert result.returncode != 0
    assert '拒绝以明文降级' in result.stderr
    assert not log.exists()


def test_launcher_environment_port_precedence_and_no_shell_eval(launcher):
    script, env, log = launcher
    marker = script.parent / 'should-not-exist'
    (script.parent / '.env').write_text(f'IOT_API_PORT=8123\nIOT_MQTT_ENABLED=false\nIOT_TLS_ENABLED=false\nEVIL=$(touch {marker})\n')
    result = subprocess.run(['bash', str(script)], env={**env, 'IOT_API_PORT': '8027'}, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    args = log.read_text().splitlines()
    assert args[args.index('--port') + 1] == '8027'
    assert '--no-proxy-headers' in args
    assert not marker.exists()


def test_launcher_reads_quoted_dotenv_port(launcher):
    script, env, log = launcher
    (script.parent / '.env').write_text('IOT_API_PORT="8123"\r\nIOT_TLS_ENABLED=false\n')
    result = subprocess.run(['bash', str(script)], env=env, capture_output=True, text=True, timeout=10)
    assert result.returncode == 0, result.stderr
    args = log.read_text().splitlines()
    assert args[args.index('--port') + 1] == '8123'
