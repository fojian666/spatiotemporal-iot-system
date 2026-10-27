"""Tests never load backend/.env or connect to the demonstration database."""
import os

# Must happen before importing any application module (Settings reads env at import).
for key in list(os.environ):
    if key.startswith('IOT_'):
        del os.environ[key]
os.environ.update({
    'IOT_DATABASE_URL': os.environ.get('TEST_DATABASE_URL', 'postgresql+asyncpg://localhost/iot_regression_test'),
    'IOT_JWT_SECRET': 'regression-only-secret-never-used-outside-tests',
    'IOT_ADMIN_PASSWORD': 'regression-admin-only',
    'IOT_OPERATOR_PASSWORD': 'regression-operator-only',
    'IOT_VIEWER_PASSWORD': 'regression-viewer-only',
    'IOT_MQTT_ENABLED': 'false',
    'IOT_MQTT_TLS': 'false',
    'IOT_LLM_ENABLED': 'false',
})

import pytest
from app.config import settings
from app import security


@pytest.fixture(autouse=True)
def isolate_settings(monkeypatch):
    original = settings.model_dump()
    security._ws_tickets.clear()
    security._login_attempts.clear()
    yield
    for key, value in original.items():
        setattr(settings, key, value)
    security._ws_tickets.clear()
    security._login_attempts.clear()
