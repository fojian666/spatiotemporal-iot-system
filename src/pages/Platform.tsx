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
    name: '教材研读',
    docs: [
      {
        id: 'edu-guide',
        title: '教材导读与学习路径',
        sections: [
          {
            paras: [
              '本平台配套教材《时空智能物联网：原理、方法与应用》（20261008 目录稿）共 6 篇 20 章，覆盖"基础体系 → 感知测量 → 通信网络 → 时空数据 → 人工智能 → 系统应用"的完整知识链。以下每篇教材文档列出该篇全部章节、提炼核心要点，并给出与平台功能的对应关系——建议对照平台边学边练。',
              '四个知识主线贯穿全书：感知、测量与定位知识链；通信、网络与数据知识链；学习、认知与决策知识链；系统设计与典型应用知识链。平台页面即按此组织——总览与仿真对应前两条链，Copilot 与知识图谱对应第三条，一网统飞与沙盘对应第四条。',
            ],
          },
          {
            heading: '建议学习节奏',
            list: [
              '第 1 阶段：第一篇（概论与体系）+ 通读平台各页面，建立整体图景',
              '第 2 阶段：第二、三篇（感知与通信）+ 完成实验一（场景推演）与实验二（真实设备接入）',
              '第 3 阶段：第四篇（时空数据）+ 结合时空一张图与趋势图理解时空组织',
              '第 4 阶段：第五、六篇（智能与应用）+ 完成实验三（无人机全流程），用 Copilot 复盘',
            ],
          },
          {
            links: [{ label: '打开知识图谱辅助理解', to: '/graph' }],
          },
        ],
      },
      {
        id: 'edu-part1',
        title: '第一篇 · 基础与体系（第1-4章）',
        sections: [
          {
            paras: [
              '本篇回答"时空智能物联网是什么、由什么组成、如何数学描述"。第 1 章建立概念与演进脉络；第 2 章给出时空信息的数学建模工具；第 3 章定义贯穿全书的对象-状态-事件-信息模型；第 4 章给出五层体系架构与智能闭环机制——这四件东西正是平台的设计骨架。',
            ],
          },
          {
            heading: '第1章 时空智能物联网概论',
            list: [
              '1.1 物联网的基本概念（定义与特征 / 对象连接服务 / 系统组成 / 发展演进）',
              '1.2 物联网固有时空属性（空间属性 / 时间属性 / 时空数据与事件 / 时空关联关系）',
              '1.3 从物联网到时空智能物联网的演进（连接→时空感知 / 采集→时空认知 / 传输→时空智能）',
              '1.4 基本内涵：全域时空感知 · 精确时空定位 · 泛在时空连接 · 时空计算与认知 · 时空预测与决策',
              '1.5 完整技术体系（感知测量 / 定位导航 / 通信网络 / 数据计算 / AI 与孪生）',
              '1.6 与人工智能、GIS、遥感、数字孪生的关系',
              '1.7 全书知识框架与多专业学习导航（四条知识链）',
            ],
          },
          {
            heading: '第2章 时空信息的数学建模与不确定性',
            list: [
              '2.1 时空信息形式化表示（对象属性集合 / 关系事件状态 / 向量矩阵张量）',
              '2.2 空间坐标与时空变换（坐标系 / 齐次坐标 / 变换链与时空基准 / 三维位姿）',
              '2.3 距离、方向与空间拓扑关系',
              '2.4 时间与时空过程建模（时间基准 / 时间戳 / 时间序列 / 过程演化）',
              '2.5 概率、随机变量与随机过程（含马尔可夫过程）',
              '2.6 图与时空图网络表达',
              '2.7 信息量与信息关联度量（熵 / 互信息）',
              '2.8 测量误差、不确定性与状态空间表达（误差模型 / 协方差 / 状态转移与观测方程）',
            ],
          },
          {
            heading: '第3章 对象、状态、事件与信息模型',
            list: [
              '3.1 物联网对象模型（数字化映射 / 身份标识 / 生命周期）',
              '3.2 物联网状态模型（语义表示 / 转移逻辑 / 时空演化）',
              '3.3 物联网事件模型（分类 / 状态变化触发 / 时空特征与影响范围）',
              '3.4 物联网信息模型（构成 / 实体关系 / 语义 / 时空扩展）',
              '3.5 对象-服务-联接模型与关联机制',
              '3.6 时空智能物联网语义体系',
            ],
          },
          {
            heading: '第4章 体系架构与智能闭环',
            list: [
              '4.1 总体体系架构（设计思路 / 组成 / 信息流关系）',
              '4.2 五层体系：时空底座层 · 全域感知层 · 协同网络层 · 时空计算层 · 智能服务层',
              '4.3 跨层贯穿机制（统一时空基准 / 时空多维标识 / 标识驱动的信息关联）',
              '4.4 端-边-云协同部署架构',
              '4.5 从感知智能到行动智能（感知 / 认知 / 决策 / 行动）',
              '4.6 时空智能闭环运行机制（采集 → 认知 → 决策 → 执行反馈）',
            ],
          },
          {
            heading: '在平台上观察本篇知识',
            list: [
              '页面右上角「系统架构」弹窗即第 4 章五层体系的可视化',
              '物模型（属性/事件/服务）对应第 3 章对象-状态-事件模型',
              '规则引擎对应第 3.2.3 节"状态变化与转移逻辑"',
            ],
          },
          {
            links: [
              { label: '态势总览', to: '/' },
              { label: '知识图谱', to: '/graph' },
            ],
          },
        ],
      },
      {
        id: 'edu-part2',
        title: '第二篇 · 智能感知与时空测量（第5-10章）',
        sections: [
          {
            paras: [
              '本篇从测量基础讲到多源融合，覆盖"把物理世界变成可计算数据"的全过程：传感器原理与性能评价（第 5 章）、信号与图像处理（第 6 章）、视觉/雷达/三维感知（第 7 章）、遥感广域观测（第 8 章）、定位与组合导航（第 9 章）、多传感器融合与状态估计（第 10 章）。平台的 11 类感知节点产品线就是这些技术的具体化。',
            ],
          },
          {
            heading: '第5章 传感器原理与智能感知节点',
            list: [
              '5.1 测量与感知基础理论（感知过程与测量链 / 精度与可靠性指标）',
              '5.2 传感器基础原理（组成分类 / 能量信息转换 / 输出特性）',
              '5.3 性能评价：灵敏度与分辨率 · 线性度与迟滞 · 重复性与稳定性 · 动态特性',
              '5.4 典型物理量感知（温湿度 / 压力 / 惯性运动 / 磁场电场）',
              '5.5-5.6 电磁信息感知 · 光电 / 声学 / 光纤感知',
              '5.7 新型感知（MEMS / 无传感器无线感知 / 柔性可穿戴 / 事件驱动边缘感知）',
            ],
          },
          {
            heading: '第6章 感知信号与图像信息处理',
            list: [
              '6.1 感知信号数字化（采样与量化 / 数字化流程）',
              '6.2 时域、频域与时频分析（傅里叶 / 短时傅里叶 / 小波 / 非平稳信号）',
              '6.3 数字滤波与噪声抑制（噪声模型与信噪比 / 低通高通带通）',
              '6.4+ 图像信息处理相关节次',
            ],
          },
          {
            heading: '第7章 视觉、雷达与三维时空感知',
            list: [
              '7.1 视觉空间感知（摄像机模型 / 坐标映射 / 相机标定）',
              '7.2 双目与深度视觉（立体匹配 / 视差深度解算 / RGB-D）',
              '7.3 激光雷达与点云感知（测距扫描 / 系统组成 / 点云表达）',
              '7.4+ 雷达感知与三维重建相关节次',
            ],
          },
          {
            heading: '第8章 遥感与广域时空感知',
            list: [
              '8.1 遥感观测基础（原理 / 系统与信息获取流程 / 分类 / 分辨率）',
              '8.2 电磁波与地物电磁响应（波谱与遥感窗口 / 反射与发射辐射特征）',
              '8.3 遥感平台与传感器系统（卫星 / 航空与无人机 / 光学与光谱成像）',
              '8.4+ 遥感处理与应用相关节次',
            ],
          },
          {
            heading: '第9章 时空定位与组合导航',
            list: [
              '9.1 定位问题与观测模型（参考节点 / 观测量 / 定位数学模型）',
              '9.2 基于距离-时间的无线定位（RSSI / ToA 与 TDoA / RTT / 多站联合）',
              '9.3 基于角度的定位（AoA / 阵列测向）',
              '9.4+ 卫星定位与组合导航相关节次',
            ],
          },
          {
            heading: '第10章 多传感器融合与时空状态估计',
            list: [
              '10.1 时空状态估计问题（定义 / 状态预测与观测更新 / 整体框架）',
              '10.2 参数估计与贝叶斯估计（最小二乘 / 加权非线性 / 最大似然）',
              '10.3 卡尔曼滤波与递推估计（核心思想 / 状态预测 / 观测更新）',
              '10.4+ 粒子滤波、多源融合结构相关节次',
            ],
          },
          {
            heading: '在平台上观察本篇知识',
            list: [
              '「物联仿真」设备观测矩阵 = 11 类感知节点，选中设备看阈值判据（对应 5.3 性能评价）',
              '「时空一张图」空天地资产 = 传感器 + 视频 + 无人机 + 卫星遥感（对应第 7、8 章）',
              '一张图上的定位标记对应第 9 章定位技术；趋势图采样对应第 6.1 节数字化',
            ],
          },
          {
            links: [
              { label: '物联仿真', to: '/simulation' },
              { label: '时空一张图', to: '/map' },
            ],
          },
        ],
      },
      {
        id: 'edu-part3',
        title: '第三篇 · 物联网通信与时空网络（第11-14章）',
        sections: [
          {
            paras: [
              '本篇讲"数据如何可靠传输"：通信原理与低功耗技术（第 11 章）、网络体系与协议栈（第 12 章）、无线传感器与自组织网络（第 13 章）、空天地一体化网络（第 14 章）。平台的 MQTT/TLS 接入链路、设备协议台账与接入契约都是这些理论的工程落地。',
            ],
          },
          {
            heading: '第11章 物联网通信原理与低功耗通信',
            list: [
              '11.1 通信系统与信息传输（基础模型 / 信息消息信号 / 性能指标）',
              '11.2 信道、噪声与无线传播（有线无线信道 / 噪声干扰 / 传播特性 / 信道模型）',
              '11.3 信道容量与通信性能（香农公式 / 带宽信噪比）',
              '11.4+ 低功耗通信技术相关节次',
            ],
          },
          {
            heading: '第12章 物联网网络体系与协议',
            list: [
              '12.1 网络体系结构（OSI 参考模型 / TCP/IP / 物联网网络体系演进）',
              '12.2 物联网协议体系（接入协议 / IPv6 互联 / 传输层 / 应用层 / 跨层优化）',
              '12.3 寻址、标识与异构互联（设备标识与地址体系 / 地址配置与设备发现）',
            ],
          },
          {
            heading: '第13章 无线传感器与移动自组织网络',
            list: [
              '13.1 无线传感器网络基础（节点结构 / 拓扑特征 / 资源受限特性）',
              '13.2 覆盖、连通性与拓扑控制（覆盖模型 / 连通性 / 拓扑控制策略）',
              '13.3 介质访问控制 MAC（CSMA/CA / 竞争型协议）',
              '13.4+ 路由协议与移动自组织网络相关节次',
            ],
          },
          {
            heading: '第14章 空天地一体化时空网络',
            list: [
              '14.1 空天地一体化网络概念（体系 / 功能层次 / 异构特征 / 融合模式）',
              '14.2 卫星物联网（通信体系 / 低轨卫星网络 / 星间链路）',
              '14.3 空基网络与低空通信（无人机通信 / 无人机网络 / 空中基站）',
              '14.4+ 一体化组网与时空服务相关节次',
            ],
          },
          {
            heading: '在平台上观察本篇知识',
            list: [
              '文档《设备接入指南》= 第 12 章协议体系的工程化（MQTT 主题、QoS、契约校验）',
              '设备台账的协议字段（MQTT / NB-IoT / LoRaWAN / 北斗短报文）覆盖第 11-14 章主要接入方式',
              '知识图谱「网络与连接」域（NB-IoT / LoRaWAN / 5G / TSN / 卫星通信实体）可直接对照',
            ],
          },
          {
            links: [
              { label: '文档中心·设备接入指南', to: '/platform' },
              { label: '知识图谱', to: '/graph' },
            ],
          },
        ],
      },
      {
        id: 'edu-part4',
        title: '第四篇 · 时空数据、计算与空间信息处理（第15-17章）',
        sections: [
          {
            paras: [
              '本篇解决"数据如何组织、计算与分析"：时空数据模型与治理（第 15 章）、云边端协同计算与多源融合（第 16 章）、GIS 地理时空处理（第 17 章）。平台的 PostGIS 时空底座、WebSocket 秒级广播与一张图的空间分析正是这三章的组合应用。',
            ],
          },
          {
            heading: '第15章 时空数据模型、数据库与数据治理',
            list: [
              '15.1 时空数据基础概念（定义 / 时空事件 / 核心特征）',
              '15.2 时空对象与轨迹（静态对象 / 移动对象 / 轨迹对象 / 动态对象）',
              '15.3 时空数据模型（矢量 / 栅格 / 点云）',
              '15.4+ 时空数据库、索引与数据治理相关节次',
            ],
          },
          {
            heading: '第16章 云边端时空计算与多源异构融合',
            list: [
              '16.1 云计算、边缘计算与端侧计算（概念 / 雾计算 / 端侧智能 / 资源组织）',
              '16.2 云边端协同计算（数据 / 计算 / 模型 / 任务四种协同）',
              '16.3 时空计算（批处理 / 流计算 / 实时时空计算）',
              '16.4+ 多源异构时空信息融合相关节次',
            ],
          },
          {
            heading: '第17章 GIS与地理时空信息处理',
            list: [
              '17.1 地理空间参考与坐标变换（坐标系 / 投影 / 时空基准统一 / 坐标转换）',
              '17.2 地理空间关系与查询（度量方向拓扑 / 邻近连通 / 属性空间联合查询）',
              '17.3 空间分析（叠加与缓冲区 / 邻域与空间统计 / 空间网络分析）',
              '17.4+ 地理时空可视化与服务相关节次',
            ],
          },
          {
            heading: '在平台上观察本篇知识',
            list: [
              'PostGIS 空间检索 /api/spatial/nearby = 第 17.2 节空间查询的工程实现',
              '每 10 秒批量幂等入库 = 第 15 章时空数据治理的最小实践',
              '趋势曲线缓冲（36 点 × 5 秒）对应第 16.3 节时空流计算',
            ],
          },
          {
            links: [
              { label: '时空一张图', to: '/map' },
              { label: '文档中心·遥测数据流', to: '/platform' },
            ],
          },
        ],
      },
      {
        id: 'edu-part5',
        title: '第五篇 · 时空人工智能、认知与决策（第18-19章）',
        sections: [
          {
            paras: [
              '本篇把数据推向智能：时空机器学习与特征表示（第 18 章）、时空认知预测与智能决策（第 19 章）。平台的物联大模型（证据链式回答）与知识图谱（56 实体语义推理）演示了"认知—预测—决策"的最小闭环。',
            ],
          },
          {
            heading: '第18章 时空人工智能与时空数据学习',
            list: [
              '18.1 时空机器学习问题（时空数据特征 / 典型任务 / 训练集与标签 / 效果评价）',
              '18.2 时空特征表示（时间特征 / 空间特征 / 时空联合 / 特征编码）',
              '18.3 基础时空机器学习方法（回归分类 / 聚类降维 / 半监督自监督）',
              '18.4+ 深度学习、图神经网络与大模型相关节次',
            ],
          },
          {
            heading: '第19章 时空认知、预测与智能决策',
            list: [
              '19.1 时空模式与相关性（时间空间模式 / 时空相关性 / 空间异质性 / 结构演化）',
              '19.2 时空关系与动态结构（空间依赖 / 时间依赖 / 动态时空图结构）',
              '19.3 场景理解与时空事件认知（场景表示 / 对象识别关系理解 / 事件检测）',
              '19.4+ 预测、决策与行动相关节次',
            ],
          },
          {
            heading: '在平台上观察本篇知识',
            list: [
              '「物联大模型」回答绑定遥测/告警/图谱证据链 = RAG 思想的最小实现',
              '「知识图谱」最短路径推演 = 第 19.2 节关系与图结构的教学演示',
              '场景推演后的健康度变化 = 时空预测的简化演示',
            ],
          },
          {
            links: [
              { label: '物联大模型', to: '/copilot' },
              { label: '知识图谱', to: '/graph' },
            ],
          },
        ],
      },
      {
        id: 'edu-part6',
        title: '第六篇 · 时空数字孪生与系统应用（第20章）',
        sections: [
          {
            paras: [
              '收官篇把前五篇整合为完整系统：数字孪生基础理论、时空数字孪生的映射与虚实协同、系统需求与总体架构，以及行业应用。平台的仿真沙盘（物理流域的数字映射）与一网统飞（感知-决策-行动闭环）是第 20 章的教学化实现。',
            ],
          },
          {
            heading: '第20章 时空数字孪生与时空智能物联网系统应用',
            list: [
              '20.1 数字孪生基础理论（概念内涵 / 核心特征 / 类型模式 / 与时空智能物联网的关系）',
              '20.2 时空数字孪生（数字化映射 / 双向映射 / 实时同步 / 虚实交互协同）',
              '20.3 系统需求与总体架构（应用场景 / 功能与非功能需求 / 架构与接口协同）',
              '20.4+ 典型行业应用案例相关节次',
            ],
          },
          {
            heading: '在平台上观察本篇知识',
            list: [
              '「物联仿真」四种场景注入 = 时空数字孪生的反向推演能力',
              '「一网统飞」从航线规划到线索处置 = 感知-决策-行动闭环',
              '态势总览的"一图感知平安"即数字孪生的可视化门面',
            ],
          },
          {
            links: [
              { label: '物联仿真', to: '/simulation' },
              { label: '一网统飞', to: '/drone' },
            ],
          },
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
        description={`${flat.length} 篇文档：平台介绍、快速入门、功能指南、开发者指南、教材研读与常见问题`}
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
