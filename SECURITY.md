# 安全策略（SECURITY）

平安区时空智能物联网演示平台的安全说明：如何报告漏洞、当前已实现的安全设计、已知限制，以及对外部署前必须完成的加固项。

> 本仓库是**演示/教学平台**：遥测由仿真合成、视频为静态影像、Copilot 为本地规则引擎。这些演示性内容是刻意设计，**不属于漏洞**（见「不在范围内」）。但消息管道（MQTT/TLS → FastAPI → PostGIS → WebSocket）与认证鉴权体系是真实实现，其缺陷按正常漏洞流程报告。

## 受支持版本

| 版本 | 支持状态 |
|---|---|
| `main` 分支最新提交 | ✅ 接受安全修复 |
| 历史提交 / 未打 tag 的旧快照 | ❌ 不回补 |

项目尚未发布版本号；安全修复只落在 `main`，请始终从最新提交部署评估。

## 如何报告漏洞

1. **优先使用私密渠道**：通过 GitHub 的 Private vulnerability reporting（仓库 Security → Advisories → Report a vulnerability）提交，包含复现步骤、影响面与建议修复方向。
2. 若私密上报未开启：先建一个**只含标题**（如「安全报告：请求私聊」）的 Issue 建立联系，**切勿在公开 Issue/PR 中贴复现细节、凭据或 payload**。
3. 收到报告后维护者会在合理时间内确认；修复以 `fix(api):` / `fix(web):` 提交并在提交说明中注明影响面（不预先公开漏洞细节）。
4. 请勿对本机常驻的演示实例（:8000）做破坏性测试；测试请自建临时端口实例（见 AGENTS.md「常用命令」）。

## 当前安全设计

### 认证与会话

- JWT（HS256），密钥仅经环境变量 `IOT_JWT_SECRET` 注入；前端 token 存 `sessionStorage`（关窗即失效）。
- 登出 = 数据库 `token_version + 1`，**一次性踢掉该用户全部旧 token**；WebSocket 一次性票据（60s 有效）同样携带 `token_version`，票据校验失败即拒连。
- RBAC 三角色（admin / operator / viewer）**双层执行**：前端 `canOperate`（`src/auth/AuthContext.tsx`）禁用 UI，后端 `require_roles` 拦截返回 403；写接口两层必须一致。
- 登录限流在 `backend/app/security.py`（`check_login_rate` / `record_login_failure`），失败记录带修剪与 512 条上限，且**按服务端归一的客户端标识计数**，伪造客户端 ID 不绕过（b0c262b）。
- 一键演示登录（`IOT_DEMO_LOGIN_ENABLED`，默认开启）：角色会话由 `/api/auth/demo-login` 在**服务端签发**，密码永不下发前端；仅供本地演示，对外部署必须关闭。

### 传输与边界

- API 走 HTTPS（:8443，mkcert 本地证书），MQTT 走 TLS（:8883）+ 用户名/ACL；`backend/run.sh` 在 `IOT_TLS_ENABLED=true` 但缺证书时**拒绝启动**，不回退明文。
- CORS 与 TrustedHost 仅限 localhost；附加安全响应头中间件（`backend/app/main.py`）。
- `/api/health` 探测不向外泄露数据库错误细节（bb4e57e）；WS 广播并发执行且单客户端 2s 超时，慢连接不拖住 others（4a6f4ee）。

### 输入与遥测契约

- 遥测契约 v1（`backend/app/schemas.py`，pydantic）：除字段校验外**拒绝非数值指标（NaN/Inf）、超量指标（>32）与过长键名**，并拒绝未注册/伪造 `device_id`；`backend/app/mqtt_bridge.py` 额外校验 topic 与 payload 的 device_id 一致。拒收计数进 `mqtt.messagesRejected`，可观测。
- 飞控指令走声明式转换表 `PLAN_TRANSITIONS`（`backend/app/drone_api.py`）：非法状态转换返回 409 且**不写审计行**，避免审计日志被非法指令污染。

### 前端边界

- `src/services/api.ts` 全部请求 15s 超时；瞬时网络错误**不登出会话**（避免闪断踢人）；飞控乐观更新在失败时回滚。
- 文本选择策略按区域白名单开放（`src/styles/theme.css`），演示内容默认不可选，输入/阅读区可复制。

## 已知限制（设计边界，非漏洞）

- **单进程约束**：WS 票据、登录限流、遥测内存态均在进程内，不支持多 worker / 多实例水平部署；扩容需先外置状态。
- **演示定位**：默认配置只服务 localhost 演示；CORS/TrustedHost 未放开外部域名，也未内置生产级证书管理。
- **合成数据**：数值、视频、推理耗时、常量统计为演示效果，其「不真实」不构成安全问题。
- 历史提交中曾入库的书籍目录 docx 已于 938f9a4 取消跟踪（`.gitignore` 忽略 `*.docx` / `*.pptx`）；旧提交仍可溯及该文件，介意外泄请视为已公开内容。

## 不在范围内

- 演示性内容的真实性（假视频、伪推理毫秒数、常量统计、硬编码告警文案）；
- 对单进程演示实例的 DoS / 资源耗尽类报告（部署形态已声明不做水平扩展）；
- 第三方在线底图（Esri 瓦片）与浏览器自身缺陷；
- 未先关闭演示开关、未按下列清单加固的「对外部署」环境的问题（该形态不受支持）。

## 对外部署前加固清单

若要把演示平台搬到非 localhost 环境，至少完成：

1. `IOT_DEMO_LOGIN_ENABLED=false`，关闭一键演示登录；
2. 替换 mkcert 本地证书为受信任证书，并收紧 CORS/TrustedHost 到实际域名；
3. 轮换全部环境变量凭据（`IOT_JWT_SECRET`、三角色密码、`IOT_MQTT_PASSWORD`），为每台真实设备建独立 MQTT 账号与 ACL（见 README「接入真实设备」）；
4. 接受单进程约束：单实例部署，或先将会话/限流/遥测状态外置；
5. 复核 `.gitignore` 红线：`.env`、`backend/certs/`、`backend/mosquitto/passwd`、书籍资料永不入库（提交前 `git status` 复核）。
