# 时空智能物联网系统 · 平安区

Spatiotemporal IoT demo platform（spatiotemporal-iot-system）——以青海海东平安区湟水河流域为虚拟场景，构建"空天地一体感知 + 无人机一网统飞 + 知识图谱 + 物联大模型"的综合演示系统。

> 演示项目：设备遥测由仿真引擎合成，视频为静态影像 + AI 检测框演示，Copilot 为本地规则引擎（不调用真实大模型，不下发真实设备指令）。

## 功能

| 模块 | 说明 |
|---|---|
| 态势总览 | 区域 KPI、多源趋势、告警流转、智能体建议 |
| 一网统飞 | 无人机机场/航线编辑（地图点选+拖拽航点）/任务计划/实时飞控/媒体成果/AI 线索闭环 |
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
# mosquitto_passwd 用户名密码见 mosquitto/mosquitto.conf

# 3. 后端（自动启动 Mosquitto；TLS 时走 8443）
.venv/bin/python -m venv .venv && .venv/bin/pip install -r requirements.txt
./run.sh                    # http://127.0.0.1:8000，文档 /docs

# 4. 前端
cd .. && cp .env.example .env.local   # VITE_DATA_SOURCE=api
npm install && npm run dev
```

角色：`admin`（管理员）/ `operator`（值班长）/ `viewer`（观察员只读），账号密码由 `IOT_*_PASSWORD` 环境变量注入。

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
