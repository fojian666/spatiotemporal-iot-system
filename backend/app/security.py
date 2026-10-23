from __future__ import annotations

import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_session
from .models import User

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)
ROLES = {"admin", "operator", "viewer"}

_ticket_lock = threading.Lock()
_ws_tickets: dict[str, tuple[int, float]] = {}
_login_lock = threading.Lock()
_login_attempts: defaultdict[str, deque[float]] = defaultdict(deque)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(password, hashed)
    except Exception:  # noqa: BLE001
        return False


def create_access_token(user: User) -> tuple[str, int]:
    if not settings.jwt_secret:
        raise RuntimeError("IOT_JWT_SECRET is not configured")
    now = datetime.now(timezone.utc)
    expires_delta = timedelta(minutes=settings.access_token_minutes)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "type": "access",
        "ver": user.token_version,
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + expires_delta,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的访问令牌",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="无效的令牌类型")
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(credentials.credentials)
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="无效的用户标识") from exc
    user = await session.get(User, user_id)
    if user is None or not user.active:
        raise HTTPException(status_code=401, detail="用户不存在或已停用")
    if int(payload.get("ver", 0)) != user.token_version:
        raise HTTPException(status_code=401, detail="会话已失效，请重新登录")
    return user


def require_roles(*roles: str) -> Callable:
    allowed = set(roles)

    async def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="当前角色没有执行该操作的权限")
        return user

    return dependency


def issue_ws_ticket(user: User) -> tuple[str, int]:
    ticket = secrets.token_urlsafe(32)
    expires_at = time.time() + settings.ws_ticket_seconds
    with _ticket_lock:
        now = time.time()
        for key in [key for key, (_, exp) in _ws_tickets.items() if exp <= now]:
            _ws_tickets.pop(key, None)
        _ws_tickets[ticket] = (user.id, expires_at)
    return ticket, settings.ws_ticket_seconds


def consume_ws_ticket(ticket: str) -> int | None:
    with _ticket_lock:
        item = _ws_tickets.pop(ticket, None)
    if not item:
        return None
    user_id, expires_at = item
    if expires_at < time.time():
        return None
    return user_id


def check_login_rate(key: str) -> tuple[bool, int]:
    now = time.time()
    with _login_lock:
        attempts = _login_attempts[key]
        while attempts and now - attempts[0] > settings.login_window_seconds:
            attempts.popleft()
        if len(attempts) >= settings.login_max_attempts:
            return False, max(1, int(settings.login_window_seconds - (now - attempts[0])))
    return True, 0


def record_login_failure(key: str) -> None:
    with _login_lock:
        _login_attempts[key].append(time.time())


def clear_login_failures(key: str) -> None:
    with _login_lock:
        _login_attempts.pop(key, None)
