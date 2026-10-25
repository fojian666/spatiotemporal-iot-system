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
./run.sh                             # 一键：按需构建前端 → 后端 + Mosquitto（入口 :8000）
npm run dev                          # 前端开发 127.0.0.1:5173
npm run build                        # tsc + vite，产物 dist/ 由后端静态挂载
backend/run.sh                       # 只起后端：自动探测 Python、按需拉起 Mosquitto
backend/scripts/setup_db.sh          # 建 iot_platform 库 + PostGIS 扩展
backend/scripts/publish_device.py    # 以外部设备身份向 MQTT 灌数（联调/验收用）
```

无测试套列。改动后的验证方式：`npm run build` + 临时端口起 uvicorn 冒烟（如 `IOT_API_PORT=8020 backend/run.sh`），**不要打断正在演示的 :8000 实例**。

## 修改前必读的同步点（最容易踩的坑）

1. **仿真逻辑双实现**：`src/engine/simulation.tsx`（TS）与 `backend/app/data.py`（Python）是逐行等价移植（computeReading/deriveStatus/buildAlerts/stats）。改公式必须两边同步，已知唯一合法分歧：速度倍数（local 生效、api 固定 1×）。
2. **设备台账双源**：前端 `src/data/devices.ts` 存原始坐标、运行时扩散（lng×1.65 / lat×1.05 偏离中心）；`backend/app/data/devices.json` 存扩散后的最终坐标。增改设备时两边必须对齐（backend = frontend × expandPoint 公式）。
3. **认证双层**：前端 `canOperate`（AuthProvider）禁用 UI + 后端 `require_roles` 拦截 403。改任何写接口时保持两层一致。登出 = DB `token_version+1` 踢全部旧 token；前端 token 存 sessionStorage。
4. **单进程约束**：WS 票据、登录限流、遥测内存态全在进程内，不支持多 worker/多实例水平部署。
5. **飞控指令走转换表**：`drone_api.py` 的 `PLAN_TRANSITIONS` 是指令→合法现状态/新状态的声明式映射，非法转换返回 409 且**不写审计行**。增改指令先改表，勿在 handler 里直改 status。
6. **遥测契约拒绝项**：`schemas.py` 除字段校验外还拒绝**非数值指标（NaN/Inf）与未注册/伪造 device_id**，拒收计数进 `mqtt.messagesRejected`；放宽校验前先想清楚。
7. **run.sh 行为**：根 `run.sh` 按需装依赖/构建前端后 `exec backend/run.sh`；后者从 `backend/.env` 读取 `IOT_MQTT_PORT / IOT_MQTT_ENABLED / IOT_TLS_ENABLED / IOT_API_PORT`（不 source 整个文件），并按 `IOT_PYTHON` → 激活中的 conda → `.venv` → Anaconda/Miniconda base → `python3` 的顺序挑第一个**依赖齐全**的解释器（conda 在脚本里常不可见为命令，故同时探测 `/opt/anaconda3` 等常见根目录）；`IOT_MQTT_ENABLED=false` 时跳过 Mosquitto；`IOT_TLS_ENABLED=true` 但缺证书时**拒绝启动**（不回退明文）。
8. **前端网络层**：`api.ts` 所有请求带 15s 超时；瞬时网络错误**不登出会话**；飞控指令的乐观更新在失败时回滚——改 DroneOps 时保持这套模式。
9. **动效降级基线**：`base.css` 的全局 `prefers-reduced-motion` 规则把动画时长归零且 fill 为 none，**仅靠 keyframes 定位的元素会回落到基础样式**。新增用 keyframe 定位的元素（参照 `.auth-atom__electron`、`.auth-atom__nucleon`）必须把静止姿态写进基础 transform，否则降级下会塌回原点。

## 视觉与动效层（纯 CSS/rAF，无动效库）

完整契约（令牌 / 排版 / 组件 / 层级 / 检查清单）见 `DESIGN.md`；改 UI 前先读它。

- **登录页**：原子核 3D 视觉（`auth.css` 的 `.auth-atom`）——三层电子壳层、拖尾电子、核子团。反向壳层的 `animation-direction: reverse` **必须同时作用于壳层与电子**，否则自旋抵消失效、电子被压扁；指针视差写 `--atom-tilt-x/y`。文案走「山河 / 信 / 巡」意象：主视觉诗意、表单侧克制，改文案时保持这条分界。
- **文档中心**：开卷书壳 + 翻页转场（`Platform.tsx` 的 flip 状态 + `pages.css` 的 `.docs-page-turn`，rotateY ±104°）；≤1100px 与 reduced-motion 下退化为直接切换。
- **控制台状态动效**：KPI 数字滚动（`useAnimatedNumber`）、toast/模态两段式退场、列表 24ms stagger（`--i`）、状态徽章脉冲、主题切换走 View Transitions API（`src/theme.ts`）。
- **响应式层**：`src/styles/responsive.css` 最后加载，宽度 ≤640（底部导航）/≤900/≤1100 + 高度 ≤760/≤560；顶栏高度只写 `var(--topbar)`，页面高度跟随内容区，改布局先读这份覆盖层。
- 入场编排集中在 `auth.css` / `base.css` 的 motion layer；全局降级开关是 `base.css` 的 `@media (prefers-reduced-motion: reduce)`，勿在组件里另造降级分支。

## 多 harness 协作

本仓库可能有多个 AI 会话并行工作。动手前：`git fetch` + `git log origin/main..main` 确认没有别人未推送/未拉取的提交；提交信息用 `fix(api):` / `fix(web):` 区分层；工作完成后尽快推送，减少本地堆积。

## 关键文件地图

```
run.sh                       一键启动：前端按需构建 → backend/run.sh
backend/run.sh               后端启动：Python/Mosquitto/TLS 探测与前置检查
DESIGN.md                    视觉与交互契约（改 UI 前先读）
src/App.tsx                  7 条一级路由：/ /drone /platform /simulation /map /graph /copilot
src/engine/simulation.tsx    双模式引擎（local 引擎 + remote WS 消费，同一 context 接口）
src/services/llm.ts          "物联大模型"= 规则引擎（纯函数 askCopilot，无外部模型调用）
src/services/api.ts          全部 API 客户端 + REMOTE_ENABLED/API_BASE
src/pages/Welcome.tsx        欢迎页（登录成功后由 AuthGate 触发一次，#/welcome 可复访）
src/pages/DroneOps.tsx       一网统飞（唯一强依赖后端的页面，local 模式显示指引）
src/pages/Platform.tsx       文档中心（侧栏目录树+正文阅读区+开卷书壳/翻页转场；文档内容在该文件 DOC_GROUPS 内维护）
src/theme.ts                 主题存储与切换（支持时经 View Transitions API 转场）
src/hooks/useAnimatedNumber.ts  KPI 数字滚动（rAF 补间，reduced-motion 直接落位）
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
- 书籍/课程资料（`*.docx`、`*.pptx`，如 20261008 目录稿）只留本地工作区：.gitignore 已忽略，**勿用 `git add -f` 入库**（938f9a4 起取消跟踪）；
- JWT 密钥、角色密码只经环境变量注入；勿在前端硬编码任何凭据；
- 一键演示登录（`IOT_DEMO_LOGIN_ENABLED`）只用于本地演示：密码永不下发前端，角色会话由 `/api/auth/demo-login` 在服务端签发；对外部署前关闭；
- WS 用一次性票据（60s）而非长期 token；CORS/TrustedHost 仅限 localhost。

## 演示性内容清单（刻意保留，勿"修复"）

- 视频 = 静态 JPG（public/assets/）+ CSS 扫描线 + 写死的 AI 检测框；
- `llm.ts` 意图级联 + 伪流水线毫秒数；Copilot 620ms 假延迟 + 打字机动画；
- 飞控进度 = 前端 1.4%/s 模拟，到 100% 自动回写 complete；HUD 坐标/风速为常量；
- 消息速率、数据质量、媒体库容量、协议占比等统计为常量；
- 告警内容为四场景硬编码文案；知识图谱为静态课程知识（56 实体/126 关系）。
