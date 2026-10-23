from __future__ import annotations

import secrets
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .data import DEVICE_BY_ID, DEVICES, iso, now_local
from .db import get_session
from .models import AiClue, AiModel, DroneRoute, FlightCommand, FlightPlan, MediaAsset, User
from .security import get_current_user, require_roles

router = APIRouter(prefix="/api/drone", tags=["drone-ops"])
Operator = require_roles("operator", "admin")


class WaypointIn(BaseModel):
    lng: float
    lat: float
    altitude: int = Field(default=120, ge=0, le=500)
    action: str = Field(default="拍照", max_length=40)
    name: str | None = None


class RouteIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    route_type: str = Field(default="航点巡检", max_length=32)
    device_id: str = Field(default="UAV-01", max_length=24)
    waypoints: list[WaypointIn] = Field(min_length=2)
    altitude: int = Field(default=120, ge=0, le=500)
    speed: float = Field(default=8.0, ge=0.5, le=25)
    gimbal_pitch: float = Field(default=-25, ge=-90, le=30)


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=140)
    route_id: str
    device_id: str = "UAV-01"
    task_type: str = "自动任务"
    planned_start: datetime
    planned_end: datetime


class CommandIn(BaseModel):
    command: Literal["takeoff", "pause", "resume", "hover", "return", "land", "complete", "fail"]
    detail: str | None = Field(default=None, max_length=200)


class ClueUpdate(BaseModel):
    status: Literal["待处理", "已核实", "已忽略"]


def _route_dict(route: DroneRoute) -> dict:
    return {
        "id": route.id,
        "name": route.name,
        "routeType": route.route_type,
        "deviceId": route.device_id,
        "waypoints": route.waypoints,
        "altitude": route.altitude,
        "speed": route.speed,
        "gimbalPitch": route.gimbal_pitch,
        "createdAt": iso(route.created_at),
        "updatedAt": iso(route.updated_at),
    }


def _plan_dict(plan: FlightPlan) -> dict:
    return {
        "id": plan.id,
        "name": plan.name,
        "routeId": plan.route_id,
        "routeName": plan.route_name,
        "deviceId": plan.device_id,
        "taskType": plan.task_type,
        "status": plan.status,
        "plannedStart": iso(plan.planned_start),
        "plannedEnd": iso(plan.planned_end),
        "actualStart": iso(plan.actual_start) if plan.actual_start else None,
        "actualEnd": iso(plan.actual_end) if plan.actual_end else None,
        "mediaUploaded": plan.media_uploaded,
        "mediaTotal": plan.media_total,
        "createdAt": iso(plan.created_at),
    }


def _media_dict(asset: MediaAsset) -> dict:
    return {
        "id": asset.id,
        "name": asset.name,
        "mediaType": asset.media_type,
        "url": asset.url,
        "planId": asset.plan_id,
        "planName": asset.plan_name,
        "routeName": asset.route_name,
        "sizeBytes": asset.size_bytes,
        "resolution": asset.resolution,
        "capturedAt": iso(asset.captured_at),
        "lng": asset.lng,
        "lat": asset.lat,
        "heading": asset.heading,
        "pitch": asset.pitch,
        "altitude": asset.altitude,
    }


def _clue_dict(clue: AiClue) -> dict:
    return {
        "id": clue.id,
        "title": clue.title,
        "modelId": clue.model_id,
        "planId": clue.plan_id,
        "routeName": clue.route_name,
        "status": clue.status,
        "objectCount": clue.object_count,
        "capturedAt": iso(clue.captured_at),
        "mediaId": clue.media_id,
        "lng": clue.lng,
        "lat": clue.lat,
    }


def _model_dict(model: AiModel) -> dict:
    return {
        "id": model.id,
        "name": model.name,
        "version": model.version,
        "target": model.target,
        "status": model.status,
        "description": model.description,
    }


def _command_dict(command: FlightCommand) -> dict:
    return {
        "id": command.id,
        "planId": command.plan_id,
        "command": command.command,
        "actor": command.actor,
        "detail": command.detail,
        "createdAt": iso(command.created_at),
    }


def _device_card(device: dict, snapshot: dict) -> dict:
    reading = snapshot["readings"].get(device["id"], {})
    return {
        "id": device["id"],
        "name": device["name"],
        "shortName": device["shortName"],
        "kind": device["kind"],
        "zone": device["zone"],
        "protocol": device["protocol"],
        "model": device["model"],
        "status": snapshot["statuses"].get(device["id"], device["status"]),
        "battery": reading.get("battery", device["battery"]),
        "signal": device["signal"],
        "lat": device["lat"],
        "lng": device["lng"],
        "reading": reading,
        "onlineSince": device.get("onlineSince"),
        "note": device.get("note"),
    }


@router.get("/overview")
async def overview(
    request: Request,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    service = request.app.state.service
    snapshot = service.snapshot()
    airports = [_device_card(d, snapshot) for d in DEVICES if d["kind"] == "drone"]
    non_airport = [
        _device_card(d, snapshot)
        for d in DEVICES
        if d["kind"] in {"ugv", "usv", "satellite"}
    ]
    ground = [
        _device_card(d, snapshot)
        for d in DEVICES
        if d["kind"] not in {"drone", "ugv", "usv", "satellite"}
    ]
    routes = (await session.scalars(select(DroneRoute).order_by(DroneRoute.updated_at.desc()))).all()
    plans = (await session.scalars(select(FlightPlan).order_by(FlightPlan.planned_start.desc()).limit(100))).all()
    media = (await session.scalars(select(MediaAsset).order_by(MediaAsset.captured_at.desc()).limit(100))).all()
    clues = (await session.scalars(select(AiClue).order_by(AiClue.captured_at.desc()).limit(100))).all()
    models = (await session.scalars(select(AiModel).order_by(AiModel.id))).all()
    commands = (await session.scalars(select(FlightCommand).order_by(FlightCommand.created_at.desc()).limit(20))).all()
    return {
        "serverTime": iso(now_local()),
        "fleet": {
            "airports": airports,
            "nonAirport": non_airport,
            "ground": ground,
        },
        "counts": {
            "airports": len(airports),
            "nonAirport": len(non_airport),
            "ground": len(ground),
            "routes": len(routes),
            "plans": len(plans),
            "activePlans": sum(1 for plan in plans if plan.status in {"执行中", "已暂停"}),
            "completedPlans": sum(1 for plan in plans if plan.status == "已完成"),
            "media": len(media),
            "clues": len(clues),
            "pendingClues": sum(1 for clue in clues if clue.status == "待处理"),
        },
        "routes": [_route_dict(route) for route in routes],
        "plans": [_plan_dict(plan) for plan in plans],
        "media": [_media_dict(asset) for asset in media],
        "clues": [_clue_dict(clue) for clue in clues],
        "models": [_model_dict(model) for model in models],
        "commands": [_command_dict(command) for command in commands],
        "mqtt": snapshot["mqtt"],
    }


@router.get("/routes")
async def list_routes(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    routes = (await session.scalars(select(DroneRoute).order_by(DroneRoute.updated_at.desc()))).all()
    return {"count": len(routes), "items": [_route_dict(route) for route in routes]}


@router.post("/routes")
async def create_route(
    payload: RouteIn,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(Operator),
) -> dict:
    if payload.device_id not in DEVICE_BY_ID:
        raise HTTPException(status_code=400, detail="设备不存在")
    now = now_local()
    route = DroneRoute(
        id=f"R-{secrets.token_hex(3).upper()}",
        name=payload.name,
        route_type=payload.route_type,
        device_id=payload.device_id,
        waypoints=[point.model_dump() for point in payload.waypoints],
        altitude=payload.altitude,
        speed=payload.speed,
        gimbal_pitch=payload.gimbal_pitch,
        created_at=now,
        updated_at=now,
    )
    session.add(route)
    await session.commit()
    return _route_dict(route)


@router.put("/routes/{route_id}")
async def update_route(
    route_id: str,
    payload: RouteIn,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(Operator),
) -> dict:
    route = await session.get(DroneRoute, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="航线不存在")
    route.name = payload.name
    route.route_type = payload.route_type
    route.device_id = payload.device_id
    route.waypoints = [point.model_dump() for point in payload.waypoints]
    route.altitude = payload.altitude
    route.speed = payload.speed
    route.gimbal_pitch = payload.gimbal_pitch
    route.updated_at = now_local()
    await session.commit()
    return _route_dict(route)


@router.delete("/routes/{route_id}")
async def delete_route(
    route_id: str,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(Operator),
) -> dict:
    route = await session.get(DroneRoute, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="航线不存在")
    in_use = await session.scalar(
        select(func.count()).select_from(FlightPlan).where(FlightPlan.route_id == route_id)
    )
    if in_use:
        raise HTTPException(status_code=409, detail="航线已被飞行计划引用，不能删除")
    await session.delete(route)
    await session.commit()
    return {"status": "deleted", "id": route_id}


@router.get("/plans")
async def list_plans(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    plans = (await session.scalars(select(FlightPlan).order_by(FlightPlan.planned_start.desc()))).all()
    return {"count": len(plans), "items": [_plan_dict(plan) for plan in plans]}


@router.post("/plans")
async def create_plan(
    payload: PlanIn,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(Operator),
) -> dict:
    route = await session.get(DroneRoute, payload.route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="航线不存在")
    device_id = payload.device_id or route.device_id
    if device_id not in DEVICE_BY_ID:
        raise HTTPException(status_code=400, detail="设备不存在")
    now = now_local()
    plan = FlightPlan(
        id=f"P-{now.strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}",
        name=payload.name,
        route_id=route.id,
        route_name=route.name,
        device_id=device_id,
        task_type=payload.task_type,
        status="未开始",
        planned_start=payload.planned_start,
        planned_end=payload.planned_end,
        media_uploaded=0,
        media_total=0,
        created_at=now,
    )
    session.add(plan)
    await session.commit()
    return _plan_dict(plan)


@router.post("/plans/{plan_id}/command")
async def plan_command(
    plan_id: str,
    payload: CommandIn,
    session: AsyncSession = Depends(get_session),
    operator: User = Depends(Operator),
) -> dict:
    plan = await session.get(FlightPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="飞行计划不存在")
    now = now_local()
    command = FlightCommand(
        plan_id=plan.id,
        command=payload.command,
        actor=operator.username,
        detail=payload.detail,
        created_at=now,
    )
    session.add(command)
    if payload.command in {"takeoff", "resume"}:
        plan.status = "执行中"
        if plan.actual_start is None:
            plan.actual_start = now
    elif payload.command == "pause":
        plan.status = "已暂停"
    elif payload.command == "fail":
        plan.status = "执行失败"
        plan.actual_end = now
    elif payload.command in {"land", "complete"}:
        plan.status = "已完成"
        plan.actual_end = now
    elif payload.command == "hover":
        pass  # 悬停不改变任务状态
    else:
        plan.status = "执行中"
        if plan.actual_start is None:
            plan.actual_start = now
    await session.commit()
    return {"plan": _plan_dict(plan), "command": _command_dict(command)}


@router.get("/media")
async def list_media(
    media_type: str | None = None,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    statement = select(MediaAsset).order_by(MediaAsset.captured_at.desc())
    if media_type:
        statement = statement.where(MediaAsset.media_type == media_type)
    assets = (await session.scalars(statement)).all()
    return {"count": len(assets), "items": [_media_dict(asset) for asset in assets]}


@router.get("/clues")
async def list_clues(
    status: str | None = None,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    statement = select(AiClue).order_by(AiClue.captured_at.desc())
    if status:
        statement = statement.where(AiClue.status == status)
    clues = (await session.scalars(statement)).all()
    return {"count": len(clues), "items": [_clue_dict(clue) for clue in clues]}


@router.patch("/clues/{clue_id}")
async def update_clue(
    clue_id: str,
    payload: ClueUpdate,
    session: AsyncSession = Depends(get_session),
    _operator: User = Depends(Operator),
) -> dict:
    clue = await session.get(AiClue, clue_id)
    if clue is None:
        raise HTTPException(status_code=404, detail="线索不存在")
    clue.status = payload.status
    await session.commit()
    return _clue_dict(clue)


@router.get("/models")
async def list_models(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    models = (await session.scalars(select(AiModel).order_by(AiModel.id))).all()
    return {"count": len(models), "items": [_model_dict(model) for model in models]}


@router.get("/commands")
async def list_commands(
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> dict:
    commands = (await session.scalars(select(FlightCommand).order_by(FlightCommand.created_at.desc()).limit(30))).all()
    return {"count": len(commands), "items": [_command_dict(command) for command in commands]}
