import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/Shell';
import { Panel } from '../components/ui';

/* ------------------------------------------------------------------ */
/* 文档内容模型                                                        */
/* ------------------------------------------------------------------ */

interface DocSection {
  heading?: string;
  paras?: string[];
  list?: string[];
  code?: string;
  table?: { head: string[]; rows: string[][] };
  note?: string;
  links?: { label: string; to: string }[];
}

interface Doc {
  id: string;
  title: string;
  sections: DocSection[];
}

interface DocGroup {
  name: string;
  docs: Doc[];
}

/* ------------------------------------------------------------------ */
/* 文档内容（本页主体）                                                */
/* ------------------------------------------------------------------ */

const DOC_GROUPS: DocGroup[] = [
  {
    name: '平台介绍',
    docs: [
      {
        id: 'overview',
        title: '平台概述',
        sections: [
          {
            paras: [
              '平安区时空智能物联网平台（ST-IoT）是面向湟水河流域的空天地一体化物联网演示与教学平台。平台以统一时空基准组织 21 个感知节点、5 套无人系统与 1 颗遥感卫星，提供从设备接入、物模型管理、规则引擎到数据流转与开放 API 的全链路能力。',
              '平台前端提供七个一级模块：态势总览、一网统飞、教学中心（本页）、物联仿真、时空一张图、知识图谱与物联大模型。后端由 FastAPI + PostgreSQL/PostGIS + Mosquitto MQTT 组成，遥测数据经真实的发布-订阅链路回灌、广播与入库。',
            ],
          },
          {
            heading: '能力总览',
            list: [
              '设备接入服务：MQTT over TLS 统一接入，契约 v1 严格校验，QoS 1 送达保障',
              '产品与设备管理：11 条产品线台账、设备实时影子与生命周期状态',
              '物模型：属性 / 事件 / 服务三段式定义，阈值随产品下发',
              '规则引擎：阈值规则实时驱动设备状态机与告警事件',
              '数据流转：MQTT 上行 → WebSocket 秒级广播 → PostGIS 批量入库',
              '开放平台：REST 28 端点 + WebSocket 推送，JWT 与三角色 RBAC 鉴权',
              '数据可视化：态势总览、时空一张图与仿真沙盘三屏联动',
            ],
          },
          {
            heading: '演示性质说明',
            note: '平台定位为演示与教学：遥测数值由仿真公式合成，视频画面为静态影像加 AI 检测框演示，物联大模型为本地规则引擎（不调用外部模型、不下发真实设备指令）。但消息管道（MQTT/TLS → FastAPI → PostGIS → WebSocket）与认证鉴权体系是真实实现的，真实设备可按《设备接入指南》直驱全链路。',
          },
        ],
      },
      {
        id: 'glossary',
        title: '名词解释',
        sections: [
          {
            paras: ['理解以下名词后，阅读其余文档与操作界面会更顺畅。'],
          },
          {
            table: {
              head: ['名词', '解释'],
              rows: [
                ['产品线', '同类设备的集合（如"水质/水文"），共享接入协议与物模型定义，相当于商业平台的"产品"概念'],
                ['设备影子', '设备最新一次上报的指标快照，平台页面展示的实时读数即来自影子'],
                ['物模型 TSL', '描述设备能力的三段式模型：属性（可读数值）、事件（上抛的告警/状态）、服务（可下发的指令）'],
                ['遥测契约 v1', '设备向平台发布遥测的消息格式约定，见《设备接入指南》'],
                ['场景', '一组环境参数（气温/湿度/水位等 9 项）与预置告警的组合，切换场景会全平台联动'],
                ['一网统飞', '无人机航线、飞行计划、实时飞控、媒体成果与 AI 线索的作业闭环模块'],
                ['设备状态机', 'online / warning / offline 三态：由物模型阈值规则每秒对遥测评判得出'],
                ['只接收模式', '关闭内置仿真后，平台仅接收外部真实设备上报的工作模式'],
              ],
            },
          },
        ],
      },
    ],
  },
  {
    name: '快速入门',
    docs: [
      {
        id: 'quick-local',
        title: '本地模式 5 分钟体验',
        sections: [
          {
            paras: ['无需任何后端与数据库，浏览器即可完整体验态势总览、仿真、一张图、图谱与大模型六个模块。'],
          },
          {
            code: '# 1. 根目录 .env.local 写入一行（默认即 local）\n# VITE_DATA_SOURCE=local\n\n# 2. 安装并启动\nnpm install\nnpm run dev\n\n# 3. 打开 http://127.0.0.1:5173 ，无需登录',
          },
          {
            heading: '本地模式说明',
            list: [
              '数据由浏览器内仿真引擎驱动，与后端公式逐行等价，展示效果一致',
              '支持 1× / 2× / 4× 速度加速，适合快速观察趋势变化',
              '「一网统飞」依赖后端数据库，本地模式会显示指引而非功能',
              '地图底图使用 Esri 在线瓦片，需联网；离线时地图区域为空属正常',
            ],
          },
        ],
      },
      {
        id: 'quick-full',
        title: '完整平台部署',
        sections: [
          {
            paras: ['完整模式包含登录鉴权、MQTT 链路、PostGIS 持久化与一网统飞，适合演示与二次开发。'],
          },
          {
            heading: '环境要求',
            list: [
              'Node.js 18+ 与 npm',
              'PostgreSQL 14+ 与 PostGIS 扩展（brew install postgresql@16 postgis）',
              'Mosquitto 2.x（brew install mosquitto）',
              'Python 3.12+（后端自带 venv）',
            ],
          },
          {
            code: '# 1. 初始化数据库（建 iot_platform 库 + postgis 扩展）\ncd backend\n./scripts/setup_db.sh\n\n# 2. 配置密钥\ncp .env.example .env\n# 编辑 .env：IOT_JWT_SECRET、三角色密码、IOT_MQTT_PASSWORD\n\n# 3. 生成证书（可选，TLS 时需要）\nmkcert -install\nmkcert -cert-file certs/server.pem -key-file certs/server-key.pem localhost 127.0.0.1\n\n# 4. 注册 MQTT 账号（与 .env 中 IOT_MQTT_USERNAME/PASSWORD 一致）\nmosquitto_passwd mosquitto/passwd iot_backend\n\n# 5. 启动后端（自动拉起 Mosquitto；TLS=true 走 https://127.0.0.1:8443）\npython3 -m venv .venv && .venv/bin/pip install -r requirements.txt\n./run.sh\n\n# 6. 前端切回 api 模式\ncd ..\n# .env.local: VITE_DATA_SOURCE=api\nnpm run dev',
          },
          {
            note: '后端文档（Swagger）地址为 /docs；健康检查为 /api/health，其中包含数据库、PostGIS 版本、MQTT 连接与收包统计。',
          },
        ],
      },
      {
        id: 'quick-login',
        title: '登录与角色权限',
        sections: [
          {
            paras: ['完整模式必须登录。平台内置三个角色，账号密码由 backend/.env 注入，首次启动时自动创建。'],
          },
          {
            table: {
              head: ['角色', '定位', '权限'],
              rows: [
                ['admin 管理员', '系统管理', '全部功能，含场景切换、飞控指令、航线管理'],
                ['operator 值班长', '日常值班', '与 admin 基本一致的业务操作权限'],
                ['viewer 观察员', '只读演示', '仅查看，所有操作按钮禁用且后端返回 403'],
              ],
            },
          },
          {
            heading: '双层鉴权机制',
            list: [
              '前端层：不可操作角色的按钮直接禁用，避免误操作',
              '后端层：所有写接口经 require_roles 校验，越权请求返回 403',
              '会话：JWT（默认 8 小时），登出会使该账号全部旧令牌失效',
              'WebSocket：使用 60 秒一次性票据，不携带长期令牌',
            ],
          },
          {
            note: '修改账号密码：编辑 backend/.env 后，需同步更新数据库中已有账号的密码哈希（seed 只在账号不存在时创建）。演示环境常用弱密码请勿用于生产。',
          },
        ],
      },
    ],
  },
  {
    name: '功能使用指南',
    docs: [
      {
        id: 'use-overview',
        title: '态势总览',
        sections: [
          { paras: ['平台开屏大屏，回答"这个区域现在怎么样"。'] },
          {
            heading: '你会看到',
            list: [
              '五张 KPI 卡：接入节点、区域健康度、活动告警、无人系统、消息速率',
              '区域感知覆盖与接入链路构成（左侧）',
              '平安区实时地图与多源趋势图（中部，可切换温湿度/水位浊度/PM2.5）',
              '告警与动态流、物联智能体建议（右侧）',
            ],
          },
          {
            heading: '怎么用',
            list: [
              '点击任意告警行展开详情，再点「联动处置」推动状态流转（待处置 → 处置中 → 已完成）',
              '右上角「场景推演」切换场景，KPI、地图航线与告警整体联动',
              '点击地图设备标记查看设备卡片，可一键「问大模型」跳转 Copilot',
            ],
          },
          { links: [{ label: '去态势总览体验', to: '/' }] },
        ],
      },
      {
        id: 'use-drone',
        title: '一网统飞',
        sections: [
          { paras: ['无人机作业工作区，覆盖航线、计划、飞控、媒体与线索的完整闭环。需要完整后端模式。'] },
          {
            heading: '怎么用',
            list: [
              '设备机场：浏览机场 / 无人系统 / 地面监控三类资产，点击进入机场操作盘',
              '航线规划：点击地图添加航点、拖动调整位置、逐点删除；填写参数后保存；被计划引用的航线不可删除',
              '任务计划：新建计划并关联航线与设备，支持按状态筛选与搜索；「计划详情」查看完整元数据',
              '实时飞控：选择计划后下发起飞/暂停/悬停/返航/降落指令，进度自动推进，完成后状态回写数据库',
              '媒体成果：按类型浏览任务影像与压缩包，查看拍摄位姿等元数据',
              'AI 线索：对识别线索执行核实/忽略，完成识别-研判-处置闭环',
            ],
          },
          {
            note: '飞控进度条为前端模拟（约 71 秒飞完），但指令本身真实落库（flight_commands 表记录操作人与时间），审计链真实。观察员角色全部只读。',
          },
          { links: [{ label: '去一网统飞体验', to: '/drone' }] },
        ],
      },
      {
        id: 'use-simulation',
        title: '物联仿真',
        sections: [
          { paras: ['仿真沙盘：理解"环境参数如何驱动设备遥测与告警"的最佳入口。'] },
          {
            heading: '怎么用',
            list: [
              '点击场景卡注入场景（常态/暴雨洪涝/森林火情/水质污染），环境丝带显示当前 9 组参数',
              '观察四段管线（感知 → 边缘 → 平台 → 智能）理解数据链路',
              '设备观测矩阵支持按状态筛选与搜索；选中设备后右侧显示阈值详情与判据',
              '本地模式可切 1×/2×/4× 加速；完整模式时钟固定 1×',
            ],
          },
          { links: [{ label: '去物联仿真体验', to: '/simulation' }] },
        ],
      },
      {
        id: 'use-map',
        title: '时空一张图',
        sections: [
          { paras: ['空间视角的总览：设备、航线、电子围栏、风险热区与卫星过境叠加在卫星底图上。'] },
          {
            heading: '怎么用',
            list: [
              '图层控制开关六类图层，理解空间叠加关系',
              '点击地图标记或右侧资产列表锁定目标，查看实时指标与 AI 线索',
              '左侧侦察画面可切换摄像头（画面为演示影像）',
              '切换火情场景后航线自动切换为 UAV-02 林火侦察',
            ],
          },
          { links: [{ label: '去时空一张图体验', to: '/map' }] },
        ],
      },
      {
        id: 'use-graph',
        title: '知识图谱',
        sections: [
          { paras: ['课程知识的语义网络：56 个实体、126 条关系、7 个知识域。'] },
          {
            heading: '怎么用',
            list: [
              '搜索框检索实体/概念，结果面板点击直达',
              '左侧最短关系路径：选起点终点后「推演语义路径」，图中绿色高亮',
              '点击知识域方块可整体隐藏/显示一类节点',
              '点击任意节点查看实体详情、属性与邻接关系',
            ],
          },
          { links: [{ label: '去知识图谱体验', to: '/graph' }] },
        ],
      },
      {
        id: 'use-copilot',
        title: '物联大模型',
        sections: [
          { paras: ['对话式助手：用自然语言查询态势、生成任务方案。本地规则引擎实现，回答绑定证据链。'] },
          {
            heading: '怎么用',
            list: [
              '欢迎页点击建议问题直接提问，或输入框 Enter 发送（Shift+Enter 换行）',
              '回答包含证据卡（遥测/告警/图谱/文档四类）、可执行动作与追问建议',
              '回答中的「切换至暴雨洪涝」等按钮可直接切换场景（观察员被拦截）',
              '右侧面板显示推理链与工具调用过程（耗时为演示数据）',
            ],
          },
          {
            note: 'Copilot 不会伪造文献引用，也不会下发真实设备指令；界面明确标注"本地演示推理"。工程上可将 askCopilot 替换为任意 OpenAI 兼容接口，返回结构保持不变。',
          },
          { links: [{ label: '去物联大模型体验', to: '/copilot' }] },
        ],
      },
    ],
  },
  {
    name: '开发者指南',
    docs: [
      {
        id: 'dev-access',
        title: '设备接入指南',
        sections: [
          {
            paras: [
              '真实设备只需向平台 MQTT Broker 发布符合契约 v1 的遥测消息，即可驱动全链路（接收校验 → 内存快照 → WebSocket 广播 → PostGIS 入库），前端无需任何改动。',
            ],
          },
          {
            heading: '消息契约 v1',
            code: '# Topic（QoS 1）\niot/pingan/devices/{device_id}/telemetry\n\n# Payload\n{\n  "version": 1,\n  "device_id": "WQ-01",\n  "ts": "2026-10-24T10:00:00.000+08:00",\n  "scenario": "normal",\n  "metrics": { "ph": 7.62, "turbidity": 18, "level": 2.18 }\n}',
          },
          {
            table: {
              head: ['字段', '类型', '说明'],
              rows: [
                ['version', 'int', '契约版本，当前 1'],
                ['device_id', 'string', '必须在设备台账注册；未知设备消息被丢弃'],
                ['ts', 'string?', 'ISO-8601 带时区；缺省用服务端接收时间'],
                ['scenario', 'string', '来源场景标签，默认 normal'],
                ['metrics', 'object', '指标名到数值的映射；非法消息拒收并计数'],
              ],
            },
          },
          {
            heading: '接入步骤',
            list: [
              '在 backend/app/data/devices.json 注册设备（id、坐标、指标阈值），开发环境清空 devices 表后重启由 seed 写入',
              '为设备创建独立 MQTT 账号：mosquitto_passwd mosquitto/passwd 设备账号，并在 mosquitto/acl 授予 topic readwrite iot/pingan/devices/#',
              '后端设置 IOT_SIMULATION_ENABLED=false 进入只接收模式（未上报设备显示离线）',
              '设备按契约发布，通过 /api/health 的 messagesReceived / messagesRejected 观测收包质量',
            ],
          },
          {
            heading: '联调脚本',
            code: '# 以外部设备身份发布 60 秒（不经过后端进程）\ncd backend\n.venv/bin/python scripts/publish_device.py --device WQ-01 --seconds 60',
          },
        ],
      },
      {
        id: 'dev-api',
        title: 'API 参考',
        sections: [
          {
            paras: [
              '所有端点位于 http://127.0.0.1:8000（TLS 部署为 https://127.0.0.1:8443），除登录与健康检查外均需 Bearer Token。完整交互式文档见后端 /docs（Swagger）。',
            ],
          },
          {
            heading: '认证与安全',
            table: {
              head: ['方法', '端点', '说明'],
              rows: [
                ['POST', '/api/auth/login', '登录换取 JWT（限流：5 次/300 秒/账号）'],
                ['GET', '/api/auth/me', '当前用户信息'],
                ['POST', '/api/auth/ws-ticket', '签发 60 秒一次性 WebSocket 票据'],
                ['POST', '/api/auth/logout', '登出，踢掉该账号全部旧令牌'],
              ],
            },
          },
          {
            heading: '设备与遥测',
            table: {
              head: ['方法', '端点', '说明'],
              rows: [
                ['GET', '/api/bootstrap', '首屏聚合快照（设备+遥测+告警+统计）'],
                ['GET', '/api/devices', '设备台账列表'],
                ['GET', '/api/devices/{id}', '设备详情 + 实时读数与状态'],
                ['GET', '/api/telemetry/latest', '最新读数、状态与统计'],
                ['GET', '/api/telemetry/history', '历史读数（minutes/limit 参数）'],
                ['WS', '/ws/telemetry', '秒级快照广播（票据鉴权）'],
              ],
            },
          },
          {
            heading: '告警与场景',
            table: {
              head: ['方法', '端点', '说明'],
              rows: [
                ['GET', '/api/alerts', '当前活动告警'],
                ['GET', '/api/alerts/history', '历史告警'],
                ['POST', '/api/alerts/{id}/ack', '告警状态流转（operator+）'],
                ['GET', '/api/scenarios', '场景列表'],
                ['POST', '/api/scenarios/{key}', '切换场景（operator+）'],
                ['POST', '/api/simulation/state', '暂停/继续仿真（operator+）'],
              ],
            },
          },
          {
            heading: '空间与图谱',
            table: {
              head: ['方法', '端点', '说明'],
              rows: [
                ['GET', '/api/spatial/nearby', '半径检索附近设备（PostGIS）'],
                ['GET', '/api/geo/devices', '设备 GeoJSON'],
                ['GET', '/api/geo/fences', '电子围栏'],
                ['GET', '/api/graph', '知识图谱数据'],
                ['GET', '/api/health', '健康检查（免鉴权）'],
              ],
            },
          },
          {
            heading: '一网统飞',
            table: {
              head: ['方法', '端点', '说明'],
              rows: [
                ['GET', '/api/drone/overview', '无人机域聚合数据'],
                ['POST/PUT/DELETE', '/api/drone/routes', '航线增删改（删除有引用保护）'],
                ['POST', '/api/drone/plans', '创建飞行计划'],
                ['POST', '/api/drone/plans/{id}/command', '飞控指令（8 种状态机）'],
                ['PATCH', '/api/drone/clues/{id}', '线索核实/忽略'],
              ],
            },
          },
        ],
      },
      {
        id: 'dev-dataflow',
        title: '遥测数据流',
        sections: [
          { paras: ['理解一条遥测消息在平台内的完整旅程。'] },
          {
            code: '仿真线程 / 外部设备\n   │  publish (QoS 1, TLS)\n   ▼\nMosquitto :8883 ── 订阅回灌 ──▶ ingest() 契约校验\n   │                              │ 拒收计数 / 未知设备丢弃\n   │                              ▼\n   │                        内存快照（读数/状态/告警/趋势）\n   │                              │\n   │              ┌───────────────┴───────────────┐\n   │              ▼                               ▼\n   │      WS /ws/telemetry 每秒广播      persistence_loop 每 10s\n   │      （前端秒级刷新）                批量写 PostGIS（幂等 upsert）',
          },
          {
            list: [
              '趋势曲线缓冲：36 点 × 5 秒（约 3 分钟窗口），更长历史走 /api/telemetry/history',
              '只接收模式下趋势由真实读数聚合采样，未上报设备显示离线',
              '告警状态变更同样持久化，历史告警可追溯',
            ],
          },
        ],
      },
    ],
  },
  {
    name: '知识与教学',
    docs: [
      {
        id: 'edu-book',
        title: '教材章节对照',
        sections: [
          {
            paras: ['平台与教材《时空智能物联网：原理、方法与应用》（20261008 目录，共 6 篇 20 章）的对应关系如下。'],
          },
          {
            table: {
              head: ['篇', '章节', '平台对应模块'],
              rows: [
                ['第一篇 基础与体系', '第1-4章 概论 / 数学建模 / 对象-状态-事件模型 / 体系架构与智能闭环', '态势总览、顶栏「系统架构」、物模型与规则引擎'],
                ['第二篇 智能感知与时空测量', '第5-10章 传感器 / 信号处理 / 视觉雷达 / 遥感 / 组合导航 / 多源融合', '物联仿真（11 条产品线）、一张图空天地资产'],
                ['第三篇 通信与时空网络', '第11-14章 低功耗通信 / 网络协议 / 传感器网络 / 空天地网络', '设备接入指南、知识图谱「网络与连接」域'],
                ['第四篇 时空数据与计算', '第15-17章 时空数据库 / 云边端融合 / GIS', 'PostGIS 底座、时空一张图、趋势分析'],
                ['第五篇 时空人工智能', '第18-19章 时空数据学习 / 认知预测与决策', '物联大模型 Copilot、知识图谱'],
                ['第六篇 系统与应用', '第20章 时空数字孪生与系统应用', '仿真沙盘场景推演、一网统飞作业闭环'],
              ],
            },
          },
          {
            heading: '建议学习路径',
            list: [
              '第 1 周：概论 + 架构 → 通读平台各页面，建立整体印象',
              '第 2-3 周：感知与通信篇 → 做实验一（场景推演）与实验二（设备接入）',
              '第 4 周：时空数据篇 → 结合一张图与趋势图理解时空组织',
              '第 5 周：智能与系统篇 → 做实验三（无人机全流程），用 Copilot 复盘',
            ],
          },
          { links: [{ label: '知识图谱中查看课程知识网络', to: '/graph' }] },
        ],
      },
      {
        id: 'edu-labs',
        title: '动手实验',
        sections: [
          {
            heading: '实验一 · 场景推演观察（入门，约 5 分钟）',
            list: [
              '进入「态势总览」，确认常态场景并记住活动告警数量',
              '右上角切换「暴雨洪涝」，观察健康度、告警、地图航线的联动变化',
              '进入「物联仿真」确认水位/浊度曲线同步抬升，理解环境参数的驱动作用',
            ],
          },
          {
            heading: '实验二 · 真实设备接入（进阶，约 10 分钟）',
            list: [
              '以只接收模式启动后端：IOT_SIMULATION_ENABLED=false ./run.sh',
              '另开终端运行联调脚本 60 秒：.venv/bin/python scripts/publish_device.py --device WQ-01 --seconds 60',
              '观察态势总览：其余设备转离线、WQ-01 显示真实上报值',
              '查看 /api/health 的 messagesReceived / messagesRejected 变化',
            ],
          },
          {
            heading: '实验三 · 无人机作业全流程（进阶，约 15 分钟）',
            list: [
              '「一网统飞 → 航线规划」：点击地图添加 4-6 个航点并保存',
              '「任务计划」新建计划关联该航线',
              '「实时飞控」依次下发起飞/悬停/返航，观察状态机与指令日志',
              '在「媒体成果」与「AI 线索」完成归档与线索核实',
            ],
          },
        ],
      },
    ],
  },
  {
    name: '常见问题',
    docs: [
      {
        id: 'faq',
        title: 'FAQ',
        sections: [
          {
            heading: '数据是真实的吗？',
            paras: [
              '遥测数值由仿真公式合成（确定性公式，同一时刻同一取值），视频为静态影像，统计类数字（消息速率、数据质量、媒体库容量等）为常量。但 MQTT/TLS、WebSocket、PostGIS、JWT 鉴权与无人机域 CRUD 是真实实现，真实设备可直驱全链路（见设备接入指南）。',
            ],
          },
          {
            heading: '地图一片空白？',
            paras: ['底图使用 Esri 在线卫星瓦片，需要联网。离线环境地图区域为空，但设备标记与航线图层仍会绘制。'],
          },
          {
            heading: '登录提示密码错误？',
            paras: ['账号密码来自 backend/.env（IOT_*_PASSWORD）。注意 seed 只在账号不存在时创建，修改 .env 后需同步更新数据库中的密码哈希，或删除对应 users 行重启由 seed 重建。'],
          },
          {
            heading: '一网统飞提示需要后端？',
            paras: ['该模块依赖数据库与登录体系，本地模式（VITE_DATA_SOURCE=local）下显示接入指引。请按《完整平台部署》启动后端并切换到 api 模式。'],
          },
          {
            heading: '切换场景没有反应？',
            paras: ['观察员（viewer）为只读角色，前端按钮禁用、后端返回 403 属预期。另外完整模式下若 WebSocket 处于重连中，快照更新会有延迟，顶栏会显示「API 重连中」。'],
          },
          {
            heading: '支持多少设备并发？',
            paras: ['演示定位为单进程部署：WebSocket 票据、登录限流与内存态快照均在进程内，不支持多 worker 水平扩展。接入真实设备建议先做容量评估。'],
          },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 文档中心页面                                                        */
/* ------------------------------------------------------------------ */

export function PlatformPage() {
  const flat = useMemo(
    () => DOC_GROUPS.flatMap((group) => group.docs.map((doc) => ({ ...doc, group: group.name }))),
    [],
  );
  const [activeId, setActiveId] = useState(flat[0].id);
  const index = Math.max(0, flat.findIndex((doc) => doc.id === activeId));
  const doc = flat[index];
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index < flat.length - 1 ? flat[index + 1] : null;

  return (
    <div className="page platform-page">
      <PageHeader
        icon={BookOpen}
        overline="ST-IOT DOC CENTER"
        title="文档中心"
        description={`${flat.length} 篇文档：平台介绍、快速入门、功能指南、开发者指南与常见问题`}
      />

      <div className="docs-layout">
        <aside className="docs-nav">
          {DOC_GROUPS.map((group) => (
            <div className="docs-nav__group" key={group.name}>
              <span className="docs-nav__group-name">{group.name}</span>
              {group.docs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`docs-nav__item ${item.id === activeId ? 'is-active' : ''}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <FileText size={12} />
                  {item.title}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <article className="docs-content">
          <header className="docs-content__head">
            <span className="overline">{doc.group.toUpperCase()}</span>
            <h2>{doc.title}</h2>
          </header>

          {doc.sections.map((section, i) => (
            <section className="docs-section" key={section.heading ?? i}>
              {section.heading && <h3>{section.heading}</h3>}
              {section.paras?.map((para) => <p key={para.slice(0, 24)}>{para}</p>)}
              {section.list && (
                <ul>
                  {section.list.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              {section.table && (
                <div className="docs-table">
                  <div className="docs-table__head">
                    {section.table.head.map((cell) => <span key={cell}>{cell}</span>)}
                  </div>
                  {section.table.rows.map((row) => (
                    <div className="docs-table__row" key={row.join('|')}>
                      {row.map((cell, ci) => <span key={`${cell}-${ci}`} className={ci === 0 ? 'is-key' : ''}>{cell}</span>)}
                    </div>
                  ))}
                </div>
              )}
              {section.code && <pre className="docs-code mono"><code>{section.code}</code></pre>}
              {section.note && <div className="docs-note">{section.note}</div>}
              {section.links && (
                <div className="docs-links">
                  {section.links.map((link) => (
                    <Link key={link.to + link.label} className="btn btn--sm btn--primary" to={link.to}>
                      {link.label} <ChevronRight size={11} />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}

          <footer className="docs-pager">
            {prev ? (
              <button type="button" className="docs-pager__btn" onClick={() => setActiveId(prev.id)}>
                <ChevronLeft size={13} /> <span><em>上一篇</em>{prev.title}</span>
              </button>
            ) : <span />}
            {next ? (
              <button type="button" className="docs-pager__btn is-next" onClick={() => setActiveId(next.id)}>
                <span><em>下一篇</em>{next.title}</span> <ChevronRight size={13} />
              </button>
            ) : <span />}
          </footer>
        </article>
      </div>
    </div>
  );
}

export type { LucideIcon, Panel };
