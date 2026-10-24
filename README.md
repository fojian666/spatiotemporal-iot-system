# 时空智能物联网系统 · 平安区

Spatiotemporal IoT demo platform（spatiotemporal-iot-system）——以青海海东平安区湟水河流域为虚拟场景，构建"空天地一体感知 + 无人机一网统飞 + 知识图谱 + 物联大模型"的综合演示系统。

> 演示项目：设备遥测由仿真引擎合成，视频为静态影像 + AI 检测框演示，Copilot 为本地规则引擎（不调用真实大模型，不下发真实设备指令）。

## 功能

| 模块 | 说明 |
|---|---|
| 态势总览 | 区域 KPI、多源趋势、告警流转、智能体建议 |
| 一网统飞 | 无人机机场/航线编辑（地图点选+拖拽航点+删除）/任务计划/实时飞控/媒体成果/AI 线索闭环 |
| 文档中心 | 模仿 OneNET / CTWing / 涂鸦开发者文档形态：侧栏目录树 + 正文阅读区，17 篇文档（平台介绍/快速入门/功能指南/开发者指南/教材对照/FAQ） |
| 物联仿真 | 4 场景注入（常态/暴雨洪涝/森林火情/水质污染），9 组环境参数驱动 |
| 时空一张图 | MapLibre + 卫星底图，设备/航线/电子围栏/热区/卫星过境图层 |
| 知识图谱 | 56 实体 / 126 关系 / 7 知识域，最短路径查询 |
| 物联大模型 | 意图识别 + 证据链引用 + 场景联动 + 伪推理流水线 |

## 技术栈

- **前端**：React 18 + TypeScript + Vite、MapLibre GL、ECharts、lucide-react
- **后端**：FastAPI + SQLAlchemy(async) + PostgreSQL/PostGIS
- **消息**：Mosquitto MQTT（TLS :8883，用户名/ACL），遥测经发布-订阅真实回路回灌
- **安全**：JWT（HS256 + token_version 登出踢出）、RBAC 三角色、登录限流、WS 一次性票据、CORS/TrustedHost/安全响应头

## 快速开始

### 纯浏览器演示（无需后端）

```bash
# .env.local: VITE_DATA_SOURCE=local
npm install
npm run dev        # http://127.0.0.1:5173
```

### 完整模式（API + MQTT + PostGIS）

```bash
# 1. PostgreSQL + PostGIS
cd backend && ./scripts/setup_db.sh

# 2. 配置密钥
cp .env.example .env        # 填 IOT_JWT_SECRET、三角色密码、IOT_MQTT_PASSWORD
# 证书：mkcert -install && mkcert -cert-file certs/server.pem \
#   -key-file certs/server-key.pem localhost 127.0.0.1
# MQTT 账号：账号密码就是 .env 里的 IOT_MQTT_USERNAME / IOT_MQTT_PASSWORD，
#   用 mosquitto_passwd mosquitto/passwd iot_backend 注册进 broker

# 3. 后端（run.sh 自动启动 Mosquitto）
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh                    # .env 保留 IOT_TLS_ENABLED=true（example 默认）→ https://127.0.0.1:8443
                            # 改为 false 则走 http://127.0.0.1:8000；文档均在 /docs

# 4. 前端
cd .. && cp .env.example .env.local   # VITE_DATA_SOURCE=api
npm install && npm run dev
```

角色：`admin`（管理员）/ `operator`（值班长）/ `viewer`（观察员只读），账号密码由 `IOT_*_PASSWORD` 环境变量注入。

## 接入真实设备（预留接口）

后端默认用内置仿真驱动全链路。设置 `IOT_SIMULATION_ENABLED=false` 后进入**只接收模式**：仿真引擎停用，真实设备经 MQTT 上报的数据直接驱动内存快照 → WebSocket 广播 → PostGIS 落库，前端零改动。该模式下未上报的设备显示为离线，趋势曲线从真实读数聚合采样。

### 遥测消息契约（v1）

设备向以下 topic 发布 JSON（QoS 1，MQTT over TLS）：

```
iot/pingan/devices/{device_id}/telemetry
```

```json
{
  "version": 1,
  "device_id": "WQ-01",
  "ts": "2026-10-24T10:00:00.000+08:00",
  "scenario": "normal",
  "metrics": { "ph": 7.62, "turbidity": 18, "level": 2.18 }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| version | int | 契约版本，当前为 1 |
| device_id | string | 必须已在设备台账注册；未知设备消息被丢弃 |
| ts | string \| null | ISO-8601 带时区；缺省使用服务端接收时间 |
| scenario | string | 来源场景标签，默认 `normal` |
| metrics | object | 指标名 → 数值，开放结构；阈值定义在设备台账 |

契约由 `backend/app/schemas.py`（pydantic）强制校验，非法消息拒收并计数；`/api/health` 与快照里的 `mqtt.messagesReceived / messagesRejected` 可观测收包质量。

### 设备注册与凭证

1. 在 `backend/app/data/devices.json` 增加设备（id、坐标、指标阈值定义）；开发环境清空 `devices` 表后重启，由 seed 重新写入。
2. 为设备侧创建独立 MQTT 账号（不要复用 `iot_backend`）：`mosquitto_passwd mosquitto/passwd <设备账号>`，并在 `mosquitto/acl` 为其授予 `topic readwrite iot/pingan/devices/#`。

### 端到端验证

```bash
.venv/bin/python scripts/publish_device.py --device WQ-01 --seconds 30
```

脚本以**外部设备身份**（独立 MQTT 连接，不经过后端进程）按上述契约发布数据，配合只接收模式即可验证整条链路，也可作为真实设备接入的参考实现。

> 告警 topic（`iot/pingan/alerts/{id}`）当前仅由后端发布、尚未开放外部订阅接入，作为后续扩展预留。

## 目录结构

```
src/            React 前端（pages / components / engine 双模式仿真 / services/llm 规则引擎）
backend/app/    FastAPI（main / drone_api / telemetry / mqtt_bridge / security / data）
backend/mosquitto/  Mosquitto 配置（conf 需按本机路径调整）
public/assets/  演示航拍影像
```

## 说明

- 仿真领域逻辑在前端 `src/engine/simulation.tsx` 与后端 `backend/app/data.py` 各有一份 TypeScript / Python 实现，用于支持无后端演示模式，修改公式需同步两处。
- 演示地理坐标相对真实卫星影像做了可读性扩散（见 `src/data/devices.ts` 注释），数据库与地图使用同一坐标系，内部一致。
- API 模式下仿真时钟固定 1×，本地模式支持 2×/4× 加速。
