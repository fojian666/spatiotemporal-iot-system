import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  FlaskConical,
  GraduationCap,
  Map as MapIcon,
  MapPin,
  Network,
  Plane,
  Play,
  Radar,
  Rocket,
  Route as RouteIcon,
  SquareTerminal,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '../components/Shell';
import { Panel, StatusPill } from '../components/ui';

/* ------------------------------------------------------------------ */
/* 教学内容数据                                                        */
/* ------------------------------------------------------------------ */

interface Tour {
  path: string;
  name: string;
  icon: LucideIcon;
  color: string;
  what: string;
  see: string[];
  try_: string[];
}

const TOURS: Tour[] = [
  {
    path: '/',
    name: '态势总览',
    icon: Radar,
    color: '#4be1ff',
    what: '整个平台的开屏大屏：先看健康度、在线率、活动告警，再从右侧告警与智能体建议进入细节。',
    see: ['五张 KPI 卡（节点 / 健康度 / 告警 / 无人系统 / 消息速率）', '平安区地图与设备标记', '多源趋势图（温湿度 / 水位浊度 / PM2.5）'],
    try_: ['点击任意告警行展开详情，再点「联动处置」推动状态流转', '右上角「场景推演」切换到暴雨洪涝，观察 KPI 与地图联动变化', '点击地图上的设备标记，查看设备卡片并「问大模型」'],
  },
  {
    path: '/drone',
    name: '一网统飞',
    icon: Plane,
    color: '#5eead4',
    what: '无人机作业工作区：从航线规划到飞控指令再到 AI 线索的完整闭环（需要完整后端模式）。',
    see: ['六个标签页：设备机场 / 航线 / 计划 / 飞控 / 媒体 / 线索', '航点地图编辑器与航点序列表', '飞控指令日志与媒体成果库'],
    try_: ['「航线规划」里点击地图添加航点，拖动调整位置，保存为新航线', '新建飞行计划后进入「实时飞控」，点起飞并观察进度与指令落库', '在「AI 线索」里核实 / 忽略识别线索，完成闭环'],
  },
  {
    path: '/simulation',
    name: '物联仿真',
    icon: FlaskConical,
    color: '#7ee787',
    what: '仿真沙盘：注入四种场景，观察环境参数如何驱动 21 台设备的遥测与告警。',
    see: ['场景卡（常态 / 暴雨 / 火情 / 污染）与 9 组环境参数', '感知 → 边缘 → 平台 → 智能四段管线', '设备观测矩阵与阈值详情'],
    try_: ['点击「暴雨洪涝」注入场景，再看左侧水质/地灾曲线的变化', '本地模式下把速度切到 4×，观察趋势图加速滚动', '选中峡群沟地灾站，对照阈值条理解预警 / 严重两级判据'],
  },
  {
    path: '/map',
    name: '时空一张图',
    icon: MapIcon,
    color: '#7aa2ff',
    what: '空间视角的一张图：设备、航线、电子围栏、热区与卫星过境全部叠加在卫星底图上。',
    see: ['六类图层开关', '沿航线运动的无人机 / 无人车 / 无人船 / 卫星标记', '左侧侦察画面与右侧空间资产列表'],
    try_: ['关闭/打开「电子围栏」「风险热区」图层感受叠加关系', '点击任意资产锁定目标，查看实时指标与 AI 线索', '切换火情场景后注意航线自动切换为 UAV-02 林火侦察'],
  },
  {
    path: '/graph',
    name: '知识图谱',
    icon: Network,
    color: '#a78bfa',
    what: '课程知识的语义网络：56 个概念实体、126 条关系，支持检索与最短路径推理。',
    see: ['七个知识域的聚类星图', '实体详情面板（属性 / 关系 / 度数）', '最短关系路径推演结果'],
    try_: ['搜索「MQTT」，点击结果高亮实体与邻接关系', '起点选「智能传感器」终点选「物联大模型」，推演语义路径', '点击左侧知识域方块，隐藏/显示整类节点'],
  },
  {
    path: '/copilot',
    name: '物联大模型',
    icon: Bot,
    color: '#f0abfc',
    what: '对话式助手：用自然语言查询实时态势、生成任务方案，每个回答都带证据链（本地规则引擎演示）。',
    see: ['带打字机效果的回答与推理链面板', '四类证据卡（遥测 / 告警 / 图谱 / 文档）', '可执行动作与追问建议'],
    try_: ['点击欢迎页建议「现在平安区有哪些风险？」', '回答里的「切换至暴雨洪涝」按钮可直接切换场景', '问「比较 MQTT 与 CoAP」，观察知识对比推理'],
  },
];

const BOOK_PARTS: { part: string; chapters: string[]; topic: string; modules: { name: string; to: string }[] }[] = [
  {
    part: '第一篇 基础与体系', topic: '对象-状态-事件模型与五层智能闭环',
    chapters: ['第1章 时空智能物联网概论', '第2章 时空信息的数学建模与不确定性', '第3章 对象、状态、事件与信息模型', '第4章 体系架构与智能闭环'],
    modules: [{ name: '态势总览（系统形态）', to: '/' }, { name: '顶栏「系统架构」弹窗', to: '/' }],
  },
  {
    part: '第二篇 智能感知与时空测量', topic: '传感器、信号处理、遥感与多源融合',
    chapters: ['第5章 传感器原理与智能感知节点', '第6章 感知信号与图像信息处理', '第7章 视觉、雷达与三维时空感知', '第8章 遥感与广域时空感知', '第9章 时空定位与组合导航', '第10章 多传感器融合与时空状态估计'],
    modules: [{ name: '物联仿真（设备观测矩阵）', to: '/simulation' }, { name: '一张图（空天地资产）', to: '/map' }],
  },
  {
    part: '第三篇 通信与时空网络', topic: '低功耗通信、网络协议与空天地网络',
    chapters: ['第11章 物联网通信原理与低功耗通信', '第12章 物联网网络体系与协议', '第13章 无线传感器与移动自组织网络', '第14章 空天地一体化时空网络'],
    modules: [{ name: '接入契约与数据流转（本页）', to: '/platform' }, { name: '知识图谱（网络与连接域）', to: '/graph' }],
  },
  {
    part: '第四篇 时空数据、计算与空间信息处理', topic: '时空数据库、云边端计算与 GIS',
    chapters: ['第15章 时空数据模型、数据库与数据治理', '第16章 云边端时空计算与多源异构融合', '第17章 GIS 与地理时空信息处理'],
    modules: [{ name: '时空一张图', to: '/map' }, { name: '态势总览趋势图', to: '/' }],
  },
  {
    part: '第五篇 时空人工智能、认知与决策', topic: '时空数据学习与认知决策',
    chapters: ['第18章 时空人工智能与时空数据学习', '第19章 时空认知、预测与智能决策'],
    modules: [{ name: '物联大模型 Copilot', to: '/copilot' }, { name: '知识图谱', to: '/graph' }],
  },
  {
    part: '第六篇 系统与应用', topic: '时空数字孪生与典型应用',
    chapters: ['第20章 时空数字孪生与系统应用'],
    modules: [{ name: '仿真沙盘场景推演', to: '/simulation' }, { name: '一网统飞作业闭环', to: '/drone' }],
  },
];

const CONCEPTS: { name: string; desc: string; focus: string }[] = [
  { name: 'MQTT', desc: '轻量级发布/订阅协议，平台设备接入的基石（TLS:8883 / QoS1）', focus: 'mqtt' },
  { name: 'CoAP', desc: '面向受限设备的 UDP 协议，与 MQTT 的选型对比见知识图谱', focus: 'coap' },
  { name: 'NB-IoT / LoRaWAN', desc: '低功耗广域网两大路线，设备台账里的真实用法', focus: 'nbiot' },
  { name: '时空基准', desc: '统一坐标与时间基准，全平台空间关联的前提', focus: 'spacetime' },
  { name: 'GIS / 一张图', desc: '地理信息系统：设备、事件、围栏的空间叠加', focus: 'gis' },
  { name: '数字孪生', desc: '物理流域的数字映射，仿真沙盘即其演示形态', focus: 'twin' },
  { name: '知识图谱', desc: '56 实体 126 关系的课程知识网络，支撑检索与推理', focus: 'kg' },
  { name: 'RAG 证据链', desc: '回答绑定实时数据与图谱出处，抑制幻觉', focus: 'rag' },
];

const LABS: { id: string; name: string; level: string; time: string; steps: string[]; code?: string }[] = [
  {
    id: 'lab-1',
    name: '实验一 · 场景推演观察',
    level: '入门',
    time: '约 5 分钟',
    steps: [
      '进入「态势总览」，确认当前为常态场景，记住活动告警数量',
      '右上角「场景推演」点击「暴雨洪涝」',
      '回到本页观察：KPI 健康度下降、地图航线变化、告警切换为洪涝四条',
      '进入「物联仿真」查看水位 / 浊度曲线是否同步抬升',
    ],
  },
  {
    id: 'lab-2',
    name: '实验二 · 真实设备接入',
    level: '进阶',
    time: '约 10 分钟',
    steps: [
      '以只接收模式启动后端（IOT_SIMULATION_ENABLED=false）',
      '另开终端运行下面的发布脚本，它以外部设备身份向 MQTT 灌数',
      '回到「态势总览」：其余设备转为离线，WQ-01 显示真实上报值',
      '观察 /api/health 中 messagesReceived / messagesRejected 的变化',
    ],
    code: 'cd backend\nIOT_SIMULATION_ENABLED=false ./run.sh          # 终端 1\n.venv/bin/python scripts/publish_device.py --device WQ-01 --seconds 60   # 终端 2',
  },
  {
    id: 'lab-3',
    name: '实验三 · 无人机作业全流程',
    level: '进阶',
    time: '约 15 分钟',
    steps: [
      '「一网统飞 → 航线规划」：点击地图添加 4-6 个航点，保存航线',
      '「任务计划」新建计划并关联该航线',
      '进入「实时飞控」，依次下发起飞 / 悬停 / 返航，观察状态机与指令日志',
      '在「媒体成果」与「AI 线索」中查看本次任务归档并核实线索',
    ],
  },
];

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

export function PlatformPage() {
  const [activePart, setActivePart] = useState(0);
  const [activeLab, setActiveLab] = useState<string | null>('lab-1');
  const part = BOOK_PARTS[activePart];

  return (
    <div className="page platform-page">
      <PageHeader
        icon={GraduationCap}
        overline="ST-IOT LEARNING CENTER"
        title="教学中心"
        description="傻瓜式上手整个平台：怎么跑起来、每个页面怎么用、每个功能对应教材哪些知识"
        actions={
          <div className="model-status">
            <StatusPill tone="ai" dot>6 篇 · 20 章 · 56 概念</StatusPill>
            <Link className="btn btn--sm" to="/graph">打开知识图谱 <ChevronRight size={11} /></Link>
          </div>
        }
      />

      <section className="learn-steps">
        {[
          { icon: Play, title: '第 1 步 · 跑起来', desc: '本地模式一行命令即可体验；完整模式见下方快速开始', tone: '#4be1ff' },
          { icon: RouteIcon, title: '第 2 步 · 逐页导览', desc: '六个页面各自是什么、能看到什么、点什么', tone: '#23e6b0' },
          { icon: Network, title: '第 3 步 · 对应知识', desc: '教材 6 篇 20 章与平台功能一一对应', tone: '#7aa2ff' },
          { icon: Rocket, title: '第 4 步 · 动手实验', desc: '三个由浅入深的实验，做完即掌握全平台', tone: '#ffbc5c' },
        ].map((step) => {
          const Icon = step.icon;
          return (
            <div className="learn-step" key={step.title} style={{ '--ls': step.tone } as CSSProperties}>
              <span className="learn-step__icon"><Icon size={16} /></span>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
            </div>
          );
        })}
      </section>

      <Panel overline="QUICK START" title="快速开始（复制即用）" icon={SquareTerminal} className="learn-quick">
        <div className="learn-quick__grid">
          <div>
            <span className="overline">方式一 · 纯浏览器体验（推荐先用这个）</span>
            <div className="code-block mono">
              <code># .env.local 写一行 VITE_DATA_SOURCE=local，然后：{`\n`}npm install &amp;&amp; npm run dev{`\n`}# 打开 http://127.0.0.1:5173 ，无需登录</code>
            </div>
          </div>
          <div>
            <span className="overline">方式二 · 完整平台（登录后体验一网统飞）</span>
            <div className="code-block mono">
              <code>cd backend &amp;&amp; ./run.sh      # 需 PostgreSQL + PostGIS + Mosquitto{`\n`}# .env.local 改回 VITE_DATA_SOURCE=api{`\n`}# 登录账号见 backend/.env（观察员 viewer 为只读）</code>
            </div>
          </div>
        </div>
        <div className="platform-bullets">
          <div><CircleCheck size={12} /><span>地图底图依赖 Esri 在线瓦片，离线环境地图区域为空属正常</span></div>
          <div><CircleCheck size={12} /><span>观察员（viewer）登录后所有操作按钮只读，适合纯观看演示</span></div>
          <div><CircleCheck size={12} /><span>页面右上角「系统架构」随时可看五层架构与数据流图解</span></div>
        </div>
      </Panel>

      <Panel overline="PAGE TOUR" title="页面导览 · 每个页面怎么用" icon={MapPin} noPad>
        <div className="learn-tours">
          {TOURS.map((tour) => {
            const Icon = tour.icon;
            return (
              <article className="learn-tour" key={tour.path} style={{ '--lt': tour.color } as CSSProperties}>
                <header className="learn-tour__head">
                  <span className="learn-tour__icon"><Icon size={17} /></span>
                  <div>
                    <h4>{tour.name}</h4>
                    <span className="mono">{tour.path}</span>
                  </div>
                  <Link className="btn btn--sm" to={tour.path}>去体验 <ArrowRight size={11} /></Link>
                </header>
                <p className="learn-tour__what">{tour.what}</p>
                <div className="learn-tour__cols">
                  <div>
                    <span className="overline">你会看到</span>
                    <ul>{tour.see.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div>
                    <span className="overline">试试看</span>
                    <ul>{tour.try_.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      <section className="platform-grid">
        <div className="platform-main">
          <Panel overline="TEXTBOOK MAP · 20261008" title="知识地图 · 教材对应" icon={Network}>
            <div className="product-tabs">
              {BOOK_PARTS.map((p, index) => (
                <button
                  key={p.part}
                  type="button"
                  className={`product-tab ${activePart === index ? 'is-active' : ''}`}
                  onClick={() => setActivePart(index)}
                >
                  <span className="product-tab__name">{p.part}</span>
                  <b className="mono">{p.chapters.length} 章</b>
                </button>
              ))}
            </div>
            <p className="learn-part__topic">{part.topic} —— 对应平台模块：{part.modules.map((m) => m.name).join('、')}</p>
            <div className="learn-chapters">
              {part.chapters.map((chapter) => (
                <div className="learn-chapter" key={chapter}>
                  <Check size={12} />
                  <span>{chapter}</span>
                </div>
              ))}
            </div>
            <div className="learn-part__links">
              {part.modules.map((m) => (
                <Link key={m.name} className="btn btn--sm" to={m.to}>{m.name} <ChevronRight size={11} /></Link>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="platform-side">
          <Panel overline="CONCEPTS" title="核心概念速查" icon={Network}>
            <div className="learn-concepts">
              {CONCEPTS.map((concept) => (
                <Link className="learn-concept" key={concept.name} to={`/graph?focus=${concept.focus}`}>
                  <strong>{concept.name}</strong>
                  <span>{concept.desc}</span>
                  <ChevronRight size={12} />
                </Link>
              ))}
            </div>
          </Panel>
        </aside>
      </section>

      <Panel overline="HANDS-ON LABS" title="动手实验 · 由浅入深" icon={FlaskConical} className="learn-labs" noPad>
        <div className="learn-labs__list">
          {LABS.map((lab) => {
            const open = activeLab === lab.id;
            return (
              <div className={`learn-lab ${open ? 'is-open' : ''}`} key={lab.id}>
                <button
                  type="button"
                  className="learn-lab__head"
                  onClick={() => setActiveLab(open ? null : lab.id)}
                  aria-expanded={open}
                >
                  <Terminal size={13} />
                  <strong>{lab.name}</strong>
                  <span className="learn-lab__meta">{lab.level} · {lab.time}</span>
                  <ChevronRight size={13} />
                </button>
                {open && (
                  <div className="learn-lab__body">
                    <ol className="learn-lab__steps">
                      {lab.steps.map((step, index) => (
                        <li key={step}>
                          <em className="mono">{index + 1}</em>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    {lab.code && <div className="code-block mono"><code>{lab.code}</code></div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

export type { LucideIcon };
