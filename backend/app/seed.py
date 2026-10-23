from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .security import hash_password
from .data import DEVICES
from .models import Device, ScenarioState, User

TZ = ZoneInfo(settings.timezone)


async def seed_database(session: AsyncSession) -> ScenarioState:
    count = await session.scalar(select(func.count()).select_from(Device))
    if not count:
        now = datetime.now(TZ)
        for device in DEVICES:
            session.add(
                Device(
                    id=device["id"],
                    name=device["name"],
                    short_name=device["shortName"],
                    kind=device["kind"],
                    zone=device["zone"],
                    protocol=device["protocol"],
                    model=device["model"],
                    status=device["status"],
                    battery=device["battery"],
                    signal=device["signal"],
                    online_since=device.get("onlineSince"),
                    note=device.get("note"),
                    lng=device["lng"],
                    lat=device["lat"],
                    geom=WKTElement(f"POINT({device['lng']} {device['lat']})", srid=4326),
                    metrics=device["metrics"],
                    created_at=now,
                )
            )
        await session.commit()

    state = await session.get(ScenarioState, 1)
    if state is None:
        state = ScenarioState(
            id=1,
            key="normal",
            running=True,
            speed=1,
            tick=0,
            updated_at=datetime.now(TZ),
        )
        session.add(state)
        await session.commit()

    accounts = [
        (settings.admin_username, settings.admin_password, settings.admin_display_name, "admin"),
        (settings.operator_username, settings.operator_password, settings.operator_display_name, "operator"),
        (settings.viewer_username, settings.viewer_password, settings.viewer_display_name, "viewer"),
    ]
    for username, password, display_name, role in accounts:
        if not username or not password:
            continue
        existing = await session.scalar(select(User).where(User.username == username))
        if existing is None:
            session.add(
                User(
                    username=username,
                    display_name=display_name,
                    role=role,
                    password_hash=hash_password(password),
                    active=True,
                    created_at=datetime.now(TZ),
                )
            )
    await session.commit()
    return state
