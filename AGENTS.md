# AGENTS.md

面向 AI 代理与新成员的项目速览。先读完本文件再动代码；更详细的介绍见 README.md。

## 项目定性（先建立正确预期）

平安区（青海海东·湟水河流域）时空智能物联网**演示平台**：数据由仿真公式合成，管道是真实的（MQTT/TLS → FastAPI → PostGIS → WebSocket）。合成数据与演示效果是**刻意设计**，不是缺陷——勿把假视频、伪推理耗时、常量统计当 bug 修。演示地理坐标相对真实卫星影像做了可读性扩散（`src/data/devices.ts` 的 `expandPoint`），全系统统一在扩散坐标系，内部一致。

## 三个运行模式开关

| 开关 | 值 | 效果 |
|---|---|---|
| `VITE_DATA_SOURCE`（根 .env.local） | `local` | 纯浏览器演示：无后端、无登录、`src/engine/simulation.tsx` 驱动一切，支持 2×/4× 加速 |
| | `api` | React → FastAPI(:8000/8443) → PostGIS + MQTT(:8883)，需登录（admin/operator/viewer），时钟固定 1× |
| `IOT_SIMULATION_ENABLED`（backend/.env） | `false` | 后端只接收模式：仿真停用，外部真实设备按契约（`backend/app/schemas.py` v1）经 MQTT 驱动全链路；未上报设备显示离线 |

## 常用命令

```bash
npm run dev                          # 前端开发 127.0.0.1:5173
npm run build                        # tsc + vite，产物 dist/ 由后端静态挂载
backend/run.sh                       # 一键后端（自动拉起 Mosquitto；TLS=true 走 8443）
backend/scripts/setup_db.sh          # 建 iot_platform 库 + PostGIS 扩展
backend/scripts/publish_device.py    # 以外部设备身份向 MQTT 灌数（联调/验收用）
```

无测试套列。改动后的验证方式：`npm run build` + 临时端口起 uvicorn 冒烟（**勿占用 8000，本机常驻着一个旧实例；也不要随手重启它**）。

## 修改前必读的四个同步点（最容易踩的坑）

1. **仿真逻辑双实现**：`src/engine/simulation.tsx`（TS）与 `backend/app/data.py`（Python）是逐行等价移植（computeReading/deriveStatus/buildAlerts/stats）。改公式必须两边同步，已知唯一合法分歧：速度倍数（local 生效、api 固定 1×）。
2. **设备台账双源**：前端 `src/data/devices.ts` 存原始坐标、运行时扩散（lng×1.65 / lat×1.05 偏离中心）；`backend/app/data/devices.json` 存扩散后的最终坐标。增改设备时两边必须对齐（backend = frontend × expandPoint 公式）。
3. **认证双层**：前端 `canOperate`（AuthProvider）禁用 UI + 后端 `require_roles` 拦截 403。改任何写接口时保持两层一致。登出 = DB `token_version+1` 踢全部旧 token；前端 token 存 sessionStorage。
4. **单进程约束**：WS 票据、登录限流、遥测内存态全在进程内，不支持多 worker/多实例水平部署。

## 关键文件地图

```
src/App.tsx                  6 条一级路由：/ /drone /simulation /map /graph /copilot
src/engine/simulation.tsx    双模式引擎（local 引擎 + remote WS 消费，同一 context 接口）
src/services/llm.ts          "物联大模型"= 规则引擎（纯函数 askCopilot，无外部模型调用）
src/services/api.ts          全部 API 客户端 + REMOTE_ENABLED/API_BASE
src/pages/DroneOps.tsx       一网统飞（唯一强依赖后端的页面，local 模式显示指引）
src/components/MapView.tsx   MapLibre + Esri 在线瓦片（离线环境无底图）
backend/app/main.py          ~22 端点 + lifespan + 安全中间件三件套 + dist 静态挂载
backend/app/drone_api.py     无人机域 REST（航线/计划/8 种飞控指令状态机/线索）
backend/app/telemetry.py     仿真线程（simulated）/ live 采样线程，双模式入口
backend/app/data.py          仿真公式内核（与前端 TS 版镜像）
backend/app/schemas.py       遥测消息契约 v1（pydantic，拒收计数进 mqtt 状态）
```

## 数据流（api 模式）

仿真线程(1s) → 发布 `iot/pingan/devices/{id}/telemetry`（QoS1）→ Mosquitto(TLS:8883) → 订阅回灌 `ingest()` → 内存快照 → WS `/ws/telemetry` 每秒广播 → persistence_loop 每 10s 批量写 PostGIS（幂等 upsert）。真实设备走同一入口，见 README"接入真实设备"。

## 安全红线

- `.env`、`backend/certs/`、`backend/mosquitto/passwd` 永不入库（.gitignore 已配，提交前 `git status` 复核）；
- JWT 密钥、角色密码只经环境变量注入；勿在前端硬编码任何凭据；
- WS 用一次性票据（60s）而非长期 token；CORS/TrustedHost 仅限 localhost。

## 演示性内容清单（刻意保留，勿"修复"）

- 视频 = 静态 JPG（public/assets/）+ CSS 扫描线 + 写死的 AI 检测框；
- `llm.ts` 意图级联 + 伪流水线毫秒数；Copilot 620ms 假延迟 + 打字机动画；
- 飞控进度 = 前端 1.4%/s 模拟，到 100% 自动回写 complete；HUD 坐标/风速为常量；
- 消息速率、数据质量、媒体库容量、协议占比等统计为常量；
- 告警内容为四场景硬编码文案；知识图谱为静态课程知识（56 实体/126 关系）。
