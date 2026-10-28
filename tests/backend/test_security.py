from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import security
from app.config import settings
from app.models import User


def user(**changes):
    return User(id=1, username='test', role='viewer', active=True, token_version=2, **changes)


def test_password_hash_and_invalid_hash():
    hashed = security.hash_password('test-only')
    assert hashed != 'test-only'
    assert security.verify_password('test-only', hashed)
    assert not security.verify_password('wrong', hashed)
    assert not security.verify_password('anything', 'invalid')


def test_signed_token_and_tampering():
    token, expires = security.create_access_token(user())
    payload = security.decode_access_token(token)
    assert payload['sub'] == '1' and payload['ver'] == 2 and expires > 0
    with pytest.raises(HTTPException) as error:
        security.decode_access_token(token + 'x')
    assert error.value.status_code == 401


@pytest.mark.parametrize('patch', [{'exp': 1}, {'iss': 'other'}, {'type': 'refresh'}])
def test_invalid_claims_rejected(patch):
    token, _ = security.create_access_token(user())
    payload = jwt.decode(token, settings.jwt_secret, algorithms=['HS256'], issuer=settings.jwt_issuer)
    payload.update(patch)
    with pytest.raises(HTTPException):
        security.decode_access_token(jwt.encode(payload, settings.jwt_secret, algorithm='HS256'))


async def test_revoked_disabled_and_absent_sessions():
    account = user()
    token, _ = security.create_access_token(account)
    credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)
    session = AsyncMock()
    session.get.return_value = account
    assert await security.get_current_user(credentials, session) is account
    account.token_version += 1
    with pytest.raises(HTTPException):
        await security.get_current_user(credentials, session)
    account.token_version = 2
    account.active = False
    with pytest.raises(HTTPException):
        await security.get_current_user(credentials, session)
    session.get.return_value = None
    with pytest.raises(HTTPException):
        await security.get_current_user(credentials, session)
    with pytest.raises(HTTPException):
        await security.get_current_user(None, session)


@pytest.mark.parametrize('role,allowed', [('admin', True), ('operator', True), ('viewer', False)])
async def test_operator_rbac(role, allowed):
    account = user()
    account.role = role
    dependency = security.require_roles('admin', 'operator')
    if allowed:
        assert await dependency(account) is account
    else:
        with pytest.raises(HTTPException) as error:
            await dependency(account)
        assert error.value.status_code == 403


def test_ws_ticket_consumed_once_even_concurrently():
    expiry = security.time.time() + 1000
    ticket, _ = security.issue_ws_ticket(user(), expiry)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: security.consume_ws_ticket(ticket), range(8)))
    assert results.count((1, 2, expiry)) == 1
    assert results.count(None) == 7


def test_expired_ws_ticket(monkeypatch):
    monkeypatch.setattr(security.time, 'time', lambda: 1000)
    ticket, _ = security.issue_ws_ticket(user(), security.time.time() + 1000)
    monkeypatch.setattr(security.time, 'time', lambda: 1061)
    assert security.consume_ws_ticket(ticket) is None


def test_login_rate_expiry_and_bounded_storage(monkeypatch):
    monkeypatch.setattr(security.time, 'time', lambda: 1000)
    for _ in range(settings.login_max_attempts):
        security.record_login_failure('client:admin')
    assert not security.check_login_rate('client:admin')[0]
    assert security.check_login_rate('client:viewer')[0]
    monkeypatch.setattr(security.time, 'time', lambda: 1301)
    assert security.check_login_rate('client:admin')[0]
    for i in range(700):
        security.record_login_failure(str(i))
    assert len(security._login_attempts) <= 512
    security.clear_login_failures('699')
    assert '699' not in security._login_attempts


def test_ticket_never_outlives_session(monkeypatch):
    monkeypatch.setattr(security.time, 'time', lambda: 1000)
    ticket, expires = security.issue_ws_ticket(user(), 1005)
    assert expires == 5
    monkeypatch.setattr(security.time, 'time', lambda: 1005)
    assert security.consume_ws_ticket(ticket) is None
    with pytest.raises(HTTPException):
        security.issue_ws_ticket(user(), 1005)
