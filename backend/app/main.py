from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from geoalchemy2.elements import WKTElement
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .data import DEVICES, FENCES, KNOWLEDGE, SCENARIOS, now_local
from .drone_api import router as drone_router
from .drone_seed import seed_drone_ops
from .db import SessionLocal, engine, get_session, init_db
from .models import Alert, Device, Reading, ScenarioState, User
from .security import (
    check_login_rate,
    clear_login_failures,
    consume_ws_ticket,
    create_access_token,
    get_current_user,
    issue_ws_ticket,
    record_login_failure,
    require_roles,
    verify_password,
)
from .seed import seed_database
from .telemetry import TelemetryService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)
TZ = ZoneInfo(settings.timezone)


class SimulationStateUpdate(BaseModel):
    running: bool | None = None
    speed: int | None = Field(default=None, ge=1, le=4)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


def user_to_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
        "role": user.role,
    }


class ConnectionManager:
    def __init__(self) -> None:
        self.active: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active.discard(websocket)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for websocket in list(self.active):
            try:
                await websocket.send_json(payload)
            except Exception:  # noqa: BLE001
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(websocket)


async def persistence_loop(service: TelemetryService) -> None:
    """Persist MQTT-ingested telemetry and alert changes regularly."""
    last_persisted: dict[str, datetime] = {}
    while True:
        try:
            await asyncio.sleep(settings.persist_interval_seconds)
            readings, reading_ts, alerts = await asyncio.to_thread(service.latest_for_persistence)
            async with SessionLocal() as session:
                for device_id, metrics in readings.items():
                    timestamp = reading_ts.get(device_id)
                    if timestamp is None or last_persisted.get(device_id) == timestamp:
                        continue
                    statement = (
                        pg_insert(Reading)
                        .values(
                            device_id=device_id,
                            ts=timestamp,
                            scenario=service.store.scenario_key,
                            tick=service.store.tick,
                            metrics=metrics,
                        )
                        .on_conflict_do_nothing(index_elements=["device_id", "ts"])
                    )
                    await session.execute(statement)
                    last_persisted[device_id] = timestamp
                for alert in alerts:
                    statement = (
                        pg_insert(Alert)
                        .values(
                            id=alert["id"],
                            level=alert["level"],
                            title=alert["title"],
                            source=alert["source"],
                            zone=alert["zone"],
                            ts=alert["ts"],
                            detail=alert["detail"],
                            status=alert["status"],
                            scenario=service.store.scenario_key,
                            geom=WKTElement(f"POINT({alert['lng']} {alert['lat']})", srid=4326),
                        )
                        .on_conflict_do_update(
                            index_elements=["id"],
                            set_={
                                "status": alert["status"],
                                "detail": alert["detail"],
                                "scenario": service.store.scenario_key,
                            },
                        )
                    )
                    await session.execute(statement)
                await session.commit()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Telemetry persistence flush failed")


async def broadcast_loop(service: TelemetryService, manager: ConnectionManager) -> None:
    while True:
        try:
            payload = await asyncio.to_thread(service.snapshot)
            await manager.broadcast(payload)
            await asyncio.sleep(settings.simulation_interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("WebSocket broadcast failed")
            await asyncio.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with SessionLocal() as session:
        state = await seed_database(session)
        await seed_drone_ops(session)
        scenario_key, running = state.key, state.running
    service = TelemetryService(scenario_key=scenario_key, running=running)
    service.start()
    manager = ConnectionManager()
    app.state.service = service
    app.state.manager = manager
    persist_task = asyncio.create_task(persistence_loop(service))
    ws_task = asyncio.create_task(broadcast_loop(service, manager))
    logger.info("API ready at http://%s:%s", settings.api_host, settings.api_port)
    try:
        yield
    finally:
        persist_task.cancel()
        ws_task.cancel()
        await asyncio.gather(persist_task, ws_task, return_exceptions=True)
        service.stop()
        await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="时空智能物联网演示后端：PostGIS + MQTT + WebSocket + FastAPI",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["127.0.0.1", "localhost", "testserver"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


def device_to_dict(device: Device) -> dict[str, Any]:
    return {
        "id": device.id,
        "name": device.name,
        "shortName": device.short_name,
        "kind": device.kind,
        "zone": device.zone,
        "protocol": device.protocol,
        "model": device.model,
        "status": device.status,
        "battery": device.battery,
        "signal": device.signal,
        "onlineSince": device.online_since,
        "note": device.note,
        "lng": device.lng,
        "lat": device.lat,
        "metrics": device.metrics,
        "geometry": {"type": "Point", "coordinates": [device.lng, device.lat]},
    }


@app.get("/api")
async def api_root() -> dict[str, Any]:
    return {
        "name": settings.app_name,
        "version": settings.version,
        "docs": "/docs",
        "health": "/api/health",
    }


@app.post("/api/auth/login")
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    client = request.client.host if request.client else "unknown"
    rate_key = f"{client}:{payload.username}"
    allowed, retry_after = check_login_rate(rate_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="登录尝试过于频繁，请稍后再试",
            headers={"Retry-After": str(retry_after)},
        )
    user = await session.scalar(select(User).where(User.username == payload.username))
    valid = bool(user and user.active and await asyncio.to_thread(verify_password, payload.password, user.password_hash))
    if not valid:
        record_login_failure(rate_key)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    clear_login_failures(rate_key)
    user.last_login_at = now_local()
    await session.commit()
    token, expires_in = create_access_token(user)
    logger.info("User %s logged in from %s", user.username, client)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": expires_in,
        "user": user_to_dict(user),
    }


@app.get("/api/auth/me")
async def auth_me(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return user_to_dict(current_user)


@app.post("/api/auth/ws-ticket")
async def auth_ws_ticket(current_user: User = Depends(get_current_user)) -> dict[str, Any]:
    ticket, expires_in = issue_ws_ticket(current_user)
    return {"ticket": ticket, "expires_in": expires_in}


@app.post("/api/auth/logout")
async def auth_logout(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    current_user.token_version += 1
    await session.commit()
    return {"status": "ok"}


@app.get("/api/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    try:
        await session.execute(text("SELECT 1"))
        database = "ok"
    except Exception as exc:  # noqa: BLE001
        database = f"error: {exc}"
    postgis = await session.scalar(text("SELECT postgis_version()"))
    return {
        "status": "ok" if database == "ok" else "degraded",
        "serverTime": now_local().isoformat(timespec="milliseconds"),
        "timezone": settings.timezone,
        "database": database,
        "postgis": postgis,
        "devices": len(DEVICES),
        **service.health(),
    }


@app.get("/api/bootstrap")
async def bootstrap(session: AsyncSession = Depends(get_session), _user: User = Depends(get_current_user)) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    snapshot = await asyncio.to_thread(service.snapshot)
    devices = (await session.scalars(select(Device).order_by(Device.id))).all()
    return {
        **snapshot,
        "devices": [device_to_dict(device) for device in devices],
        "server": {
            "name": settings.app_name,
            "version": settings.version,
            "timezone": settings.timezone,
        },
    }


@app.get("/api/devices")
async def list_devices(session: AsyncSession = Depends(get_session), _user: User = Depends(get_current_user)) -> dict[str, Any]:
    devices = (await session.scalars(select(Device).order_by(Device.id))).all()
    return {"count": len(devices), "items": [device_to_dict(device) for device in devices]}


@app.get("/api/devices/{device_id}")
async def get_device(device_id: str, session: AsyncSession = Depends(get_session), _user: User = Depends(get_current_user)) -> dict[str, Any]:
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="device not found")
    service: TelemetryService = app.state.service
    snapshot = service.snapshot()
    return {
        **device_to_dict(device),
        "reading": snapshot["readings"].get(device_id),
        "runtimeStatus": snapshot["statuses"].get(device_id),
    }


@app.get("/api/telemetry/latest")
async def latest_telemetry(_user: User = Depends(get_current_user)) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    snapshot = await asyncio.to_thread(service.snapshot)
    return {
        "serverTime": snapshot["server_time"],
        "tick": snapshot["tick"],
        "readings": snapshot["readings"],
        "statuses": snapshot["statuses"],
        "stats": snapshot["stats"],
    }


@app.get("/api/telemetry/history")
async def telemetry_history(
    device_id: str | None = Query(default=None),
    minutes: int = Query(default=10, ge=1, le=1440),
    limit: int = Query(default=500, ge=1, le=5000),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict[str, Any]:
    since = now_local() - timedelta(minutes=minutes)
    statement = select(Reading).where(Reading.ts >= since).order_by(Reading.ts.desc()).limit(limit)
    if device_id:
        statement = statement.where(Reading.device_id == device_id)
    rows = (await session.scalars(statement)).all()
    return {
        "deviceId": device_id,
        "minutes": minutes,
        "count": len(rows),
        "items": [
            {
                "deviceId": row.device_id,
                "ts": row.ts.isoformat(),
                "scenario": row.scenario,
                "metrics": row.metrics,
            }
            for row in rows
        ],
    }


@app.get("/api/alerts")
async def list_alerts(session: AsyncSession = Depends(get_session), _user: User = Depends(get_current_user)) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    active = await asyncio.to_thread(service.get_alerts)
    db_count = await session.scalar(select(func.count()).select_from(Alert))
    return {
        "active": active,
        "activeCount": sum(1 for alert in active if alert["status"] != "已完成"),
        "persistedCount": db_count,
    }


@app.get("/api/alerts/history")
async def alert_history(
    limit: int = Query(default=50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict[str, Any]:
    rows = (await session.scalars(select(Alert).order_by(Alert.ts.desc()).limit(limit))).all()
    return {
        "count": len(rows),
        "items": [
            {
                "id": row.id,
                "level": row.level,
                "title": row.title,
                "source": row.source,
                "zone": row.zone,
                "ts": row.ts.isoformat(),
                "detail": row.detail,
                "status": row.status,
                "scenario": row.scenario,
            }
            for row in rows
        ],
    }


@app.post("/api/alerts/{alert_id}/ack")
async def ack_alert(alert_id: str, _operator: User = Depends(require_roles('operator', 'admin'))) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    before = {alert["id"] for alert in service.store.alerts}
    if alert_id not in before:
        raise HTTPException(status_code=404, detail="alert not found")
    return await asyncio.to_thread(service.cycle_alert, alert_id)


@app.get("/api/scenarios")
async def list_scenarios(_user: User = Depends(get_current_user)) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    return {
        "current": service.store.scenario_key,
        "items": [
            {
                "key": key,
                "name": value["name"],
                "code": value["code"],
                "severity": value["severity"],
                "tagline": value["tagline"],
                "triggers": value["triggers"],
            }
            for key, value in SCENARIOS.items()
        ],
    }


@app.post("/api/scenarios/{scenario_key}")
async def set_scenario(
    scenario_key: str,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(require_roles("operator", "admin")),
) -> dict[str, Any]:
    if scenario_key not in SCENARIOS:
        raise HTTPException(status_code=404, detail="scenario not found")
    service: TelemetryService = app.state.service
    result = await asyncio.to_thread(service.set_scenario, scenario_key)
    state = await session.get(ScenarioState, 1)
    if state:
        state.key = scenario_key
        state.updated_at = now_local()
        await session.commit()
    return result


@app.post("/api/simulation/state")
async def update_simulation_state(
    update: SimulationStateUpdate,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(require_roles("operator", "admin")),
) -> dict[str, Any]:
    service: TelemetryService = app.state.service
    if update.running is not None:
        await asyncio.to_thread(service.set_running, update.running)
    if update.speed is not None:
        await asyncio.to_thread(service.set_speed, update.speed)
    state = await session.get(ScenarioState, 1)
    if state:
        if update.running is not None:
            state.running = update.running
        state.speed = 1
        state.updated_at = now_local()
        await session.commit()
    return await asyncio.to_thread(service.snapshot)


@app.get("/api/spatial/nearby")
async def spatial_nearby(
    lng: float = Query(...),
    lat: float = Query(...),
    radius: int = Query(default=5000, ge=100, le=100000),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict[str, Any]:
    statement = text(
        """
        SELECT id, name, zone, kind, protocol,
               ROUND(ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))::numeric, 1) AS distance_m
        FROM devices
        WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :radius
        )
        ORDER BY distance_m ASC
        LIMIT 50
        """
    )
    rows = (await session.execute(statement, {"lng": lng, "lat": lat, "radius": radius})).mappings().all()
    return {
        "center": {"lng": lng, "lat": lat},
        "radiusMeters": radius,
        "count": len(rows),
        "items": [dict(row) for row in rows],
    }


@app.get("/api/geo/devices")
async def geo_devices(session: AsyncSession = Depends(get_session), _user: User = Depends(get_current_user)) -> dict[str, Any]:
    devices = (await session.scalars(select(Device))).all()
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [device.lng, device.lat]},
                "properties": {
                    "id": device.id,
                    "name": device.name,
                    "kind": device.kind,
                    "zone": device.zone,
                },
            }
            for device in devices
        ],
    }


@app.get("/api/graph")
async def graph(_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return KNOWLEDGE


@app.get("/api/geo/fences")
async def fences(_user: User = Depends(get_current_user)) -> dict[str, Any]:
    return {"items": FENCES}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    service: TelemetryService = app.state.service
    manager: ConnectionManager = app.state.manager
    ticket = websocket.query_params.get("ticket")
    user_id = consume_ws_ticket(ticket) if ticket else None
    if user_id is None:
        await websocket.accept()
        await websocket.close(code=4401, reason="invalid or expired ws ticket")
        return
    async with SessionLocal() as session:
        user = await session.get(User, user_id)
        if user is None or not user.active:
            await websocket.accept()
            await websocket.close(code=4401, reason="user disabled")
            return
    await manager.connect(websocket)
    try:
        await websocket.send_json(await asyncio.to_thread(service.snapshot))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:  # noqa: BLE001
        manager.disconnect(websocket)


app.include_router(drone_router)

DIST_DIR = Path(__file__).resolve().parents[2] / "dist"
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")

