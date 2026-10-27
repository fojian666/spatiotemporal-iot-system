"""Prove the test harness refuses a mismatched application database before connecting."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.engine import make_url

from app import db
from regression_support import isolated_lifespan


async def test_reset_refuses_mismatched_engine_before_any_database_call(monkeypatch):
    import regression_support
    monkeypatch.setenv('TEST_DATABASE_URL', 'postgresql+asyncpg://test@127.0.0.1/iot_regression_test')
    monkeypatch.setattr(db, 'engine', SimpleNamespace(url=make_url('postgresql+asyncpg://test@127.0.0.1/iot_platform')))
    connect = AsyncMock()
    monkeypatch.setattr(regression_support.asyncpg, 'connect', connect)
    with pytest.raises(RuntimeError, match='engine differs'):
        async with isolated_lifespan(None):
            pytest.fail('must never enter application lifespan')
    connect.assert_not_awaited()


async def test_reset_refuses_non_test_database(monkeypatch):
    monkeypatch.setenv('TEST_DATABASE_URL', 'postgresql+asyncpg://test@127.0.0.1/iot_platform')
    with pytest.raises(RuntimeError, match='must name'):
        async with isolated_lifespan(None):
            pytest.fail('must never enter application lifespan')
