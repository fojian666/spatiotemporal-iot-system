# 自动回归

入口为 `npm run test:all`，任一阶段失败立即返回非零退出码。覆盖构建、测试代码类型检查、前端逻辑、前后端一致性、真实 PostGIS/API、TLS MQTT、浏览器与文档漂移。GitHub Actions 在 main 推送、PR 与手动触发时执行同一命令，保留报告 14 天。

```mermaid
flowchart LR
  类型检查 --> 构建 --> 前端契约与覆盖率 --> 后端集成与覆盖率 --> 浏览器回归 --> 文档漂移检查
```

## 首次准备

需要 Node 22、Python 3.13、PostgreSQL 16 + PostGIS、Mosquitto、OpenSSL。CI 自动准备这些依赖。本机沿用项目 Python 虚拟环境；也可用 `TEST_PYTHON=/absolute/path/to/python` 指定解释器。

```bash
npm ci
# 虚拟环境没有 pip 时，可用 uv pip install --python backend/.venv/bin/python -r backend/requirements-test.txt
backend/.venv/bin/python -m pip install -r backend/requirements-test.txt
npx playwright install chromium

# USER 替换为拥有创建测试库权限的本机 PostgreSQL 用户。
export TEST_DATABASE_URL='postgresql+asyncpg://USER@127.0.0.1:5432/iot_regression_test'
backend/.venv/bin/python scripts/prepare-test-db.py
npm run test:all
```

测试只接受名字**恰为 `iot_regression_test`** 的专用可清空数据库。API 和 E2E 在启动前重建其中的应用表，不操作演示库 `iot_platform`。准备脚本只创建测试库和 PostGIS 扩展，不删除已有数据库。两个套件共享 PostgreSQL 排他锁；其他 harness 正在测试时会明确失败，请等其结束再运行。

Python 测试启动器使用空临时工作目录，清理继承的 `IOT_*` 配置并注入测试专用账号和密钥，防止读取开发者 `.env`、证书或调用付费模型。测试账号只能用于测试。不要把真实服务的数据库连接写入 `TEST_DATABASE_URL`。

浏览器独立启动 :8020 后端和 :4175/:4176 前端（分别为 local/api 正式构建），占用端口时直接失败，不复用未知服务；**不会中断 :8000**。测试结束自动关闭临时进程。TLS MQTT 使用临时端口和一天有效期的临时证书，结束后关闭 broker，不改现有 Mosquitto 配置。

## 分层命令

| 命令 | 用途 | 外部依赖 |
|---|---|---|
| `npm test` | 前端逻辑、数据和跨语言契约 | Python 后端依赖；无数据库连接 |
| `npm run test:watch` | 开发时持续运行前端测试 | 同上 |
| `npm run test:types` | 测试与配置文件的 TypeScript 类型检查 | 无服务 |
| `npm run test:coverage` | 前端逻辑覆盖率报告与门禁 | Python 后端依赖 |
| `npm run test:backend:unit` | 后端纯逻辑、安全和启动脚本检查 | 无服务 |
| `npm run test:backend` | 完整后端集成与 TLS MQTT 回归 | 专用 PostGIS 库、Mosquitto、OpenSSL |
| `npm run test:e2e` | local/api 浏览器流程、布局与降级 | 专用 PostGIS 库、Chromium |
| `npm run test:all` | 提交前完整门禁 | 上述全部 |

完整入口缺少测试库或 broker 会失败，不把跳过集成测试算成通过。直接执行 pytest 且没有 `TEST_DATABASE_URL` 时，数据库集成项会 skip；这仅方便诊断，不能替代完整验收。

## 覆盖矩阵

- **双源契约**：全部 21 台设备的身份、扩散坐标、指标和阈值；四场景配置；知识图谱节点/边及引用完整性。
- **仿真与聚合**：21 台设备 × 四场景 × 九个 tick 的逐指标数值与状态；四场景告警文案/顺序/时间/状态；多 tick 的 KPI、平均值和健康分；local 暂停/4×/恢复、api 固定 1×、事件与历史容量边界。Python 输出在每次测试时实时生成，避免仅比对陈旧快照而漏掉当前双端漂移。
- **接入与持久化**：NaN/Inf、非法指标、数量/名称长度、异常 JSON、topic/设备身份不匹配、未注册设备；真实 TLS 发布→订阅→内存→历史采样；live 模式不伪造未上报设备；快照深拷贝；落库幂等、提交失败不推进检查点、历史筛选、PostGIS 附近查询。
- **认证与权限**：密码与 JWT 校验、过期/篡改/issuer/type、会话版本和停用用户、三角色权限、全部业务读接口鉴权、全部业务写路由禁止 viewer、登录限流、demo-login 关闭、WS 票据并发单次消费/过期/重放、登出撤销旧 token 和连接。
- **无人机域**：航线 CRUD/引用删除保护；八种指令 × 五种计划状态，校验响应、最终状态、实际时间和审计行；并发起飞只允许一个成功；浏览器验证指令失败回滚。
- **Copilot**：所有设备 ID/名称/短名定位、四场景主要意图、证据去重和导航入口、推演需人工确认、上下文越限指标排序/1200 字符上限、固定提示指纹、显式关闭思考、成功/超时/重试/畸形响应、未配置降级、前端 15s/30s 超时、云端成功与规则回退流程。上游全部替身，不调用真实付费模型。
- **浏览器**：七模块 × 桌面/平板/手机；页面异常与水平溢出；告警→地图→遥测→返回；筛选刷新/清空；文档移动目录/翻页；主题与减少动态效果；七模块路由入场/返回重播、页内筛选与实时刷新不重播、380ms 节奏上限、静止姿态；只读操作、六个飞控页签、地图离线降级/重试、登出。关键页截图供人工审查。
- **启动与协作**：TLS 缺证书拒绝明文降级、环境变量优先、带引号 dotenv、不执行 dotenv 中的 shell 内容；文档关键数字漂移检查。

## 报告与边界

前端门禁限定在 engine/services/hooks/auth/motion 等逻辑文件：行/语句/函数 ≥80%，分支 ≥70%；后端 app 总行覆盖率 ≥80%。覆盖率是防退步门槛，不等同于业务正确率，也不代表全部页面 JSX 已有单元覆盖。页面靠 E2E 验证。

- `coverage/lcov.info`、`coverage/backend.xml`：机器可读覆盖率。
- `playwright-report/index.html`：浏览器报告；`npx playwright show-report` 打开。
- `test-results/`：失败截图和 trace；`npx playwright show-trace <trace.zip>` 排查。
- `output/playwright/`：桌面/平板/手机关键页截图，均已忽略入库。

自动化七模块布局检查使用 1440×1000、1024×1000、390×1000，另有手机 390×844 和平板 1024×900 的交互用例。另在 390×844、768×1024、1440×720 对七模块执行静态动效降级检查并生成截图。涉及 UI 修改时，仍需按 `DESIGN.md` 检查清单对这些尺寸做人工截图审查；自动化与人工互为补充。

本轮浏览器主引擎为 Chromium；未包含 Safari/Firefox、真实外部设备、真实云端模型质量/计费、在线卫星影像质量、长时间压测和生产证书轮换。外网地图默认阻断以保证离线降级可重复，不把供应商网络波动作为应用回归。截图供人工审查，不做会被时钟与仿真变化干扰的逐像素快照比较。

新增 bug 先加入能失败的案例，再修复实现；新增接口补齐匿名/只读/可写/非法输入四类断言。不要通过删除断言、放宽数值误差或增加自动重试掩盖失败。
