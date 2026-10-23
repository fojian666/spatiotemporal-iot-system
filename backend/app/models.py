from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Boolean, DateTime, Float, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    short_name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(24), index=True)
    zone: Mapped[str] = mapped_column(String(60), index=True)
    protocol: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), default="online")
    battery: Mapped[int] = mapped_column(Integer, default=100)
    signal: Mapped[int] = mapped_column(Integer, default=100)
    online_since: Mapped[str | None] = mapped_column(String(40), nullable=True)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    lng: Mapped[float] = mapped_column(Float)
    lat: Mapped[float] = mapped_column(Float)
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    metrics: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (
        UniqueConstraint("device_id", "ts", name="uq_readings_device_ts"),
        Index("ix_readings_device_ts", "device_id", "ts"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(24), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    scenario: Mapped[str] = mapped_column(String(24), default="normal")
    tick: Mapped[int] = mapped_column(Integer, default=0)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    level: Mapped[str] = mapped_column(String(16), index=True)
    title: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(24), index=True)
    zone: Mapped[str] = mapped_column(String(60))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    detail: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="待处置")
    scenario: Mapped[str] = mapped_column(String(24), default="normal")
    geom = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(16), default="viewer")
    password_hash: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)


class DroneRoute(Base):
    __tablename__ = "drone_routes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    route_type: Mapped[str] = mapped_column(String(32), default="航点巡检")
    device_id: Mapped[str] = mapped_column(String(24))
    waypoints: Mapped[list] = mapped_column(JSONB, default=list)
    altitude: Mapped[int] = mapped_column(Integer, default=120)
    speed: Mapped[float] = mapped_column(Float, default=8.0)
    gimbal_pitch: Mapped[float] = mapped_column(Float, default=-25.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FlightPlan(Base):
    __tablename__ = "flight_plans"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(140))
    route_id: Mapped[str] = mapped_column(String(32), index=True)
    route_name: Mapped[str] = mapped_column(String(120))
    device_id: Mapped[str] = mapped_column(String(24))
    task_type: Mapped[str] = mapped_column(String(32), default="自动任务")
    status: Mapped[str] = mapped_column(String(24), default="未开始", index=True)
    planned_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    planned_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    media_uploaded: Mapped[int] = mapped_column(Integer, default=0)
    media_total: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(180))
    media_type: Mapped[str] = mapped_column(String(16), default="image", index=True)
    url: Mapped[str] = mapped_column(String(300))
    plan_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    plan_name: Mapped[str | None] = mapped_column(String(140), nullable=True)
    route_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    resolution: Mapped[str] = mapped_column(String(32), default="")
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lng: Mapped[float] = mapped_column(Float, default=0)
    lat: Mapped[float] = mapped_column(Float, default=0)
    heading: Mapped[float] = mapped_column(Float, default=0)
    pitch: Mapped[float] = mapped_column(Float, default=0)
    altitude: Mapped[float] = mapped_column(Float, default=0)


class AiModel(Base):
    __tablename__ = "ai_models"

    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    version: Mapped[str] = mapped_column(String(24))
    target: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), default="已启用")
    description: Mapped[str] = mapped_column(Text, default="")


class AiClue(Base):
    __tablename__ = "ai_clues"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    model_id: Mapped[str] = mapped_column(String(24))
    plan_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    route_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="待处理", index=True)
    object_count: Mapped[int] = mapped_column(Integer, default=0)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    media_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    lng: Mapped[float] = mapped_column(Float, default=0)
    lat: Mapped[float] = mapped_column(Float, default=0)


class FlightCommand(Base):
    __tablename__ = "flight_commands"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    plan_id: Mapped[str] = mapped_column(String(40), index=True)
    command: Mapped[str] = mapped_column(String(32))
    actor: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScenarioState(Base):
    __tablename__ = "scenario_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    key: Mapped[str] = mapped_column(String(24), default="normal")
    running: Mapped[bool] = mapped_column(default=True)
    speed: Mapped[int] = mapped_column(Integer, default=1)
    tick: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
