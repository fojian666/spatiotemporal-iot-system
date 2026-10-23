import { DEVICES, KIND_META, DRONE_ROUTE, FOREST_ROUTE } from '../data/devices';
import {
  CATEGORY_META,
  GRAPH_STATS,
  KNOWLEDGE_NODES,
  getNeighbors,
  getNode,
  type KnowledgeNode,
} from '../data/knowledge';
import { formatSimTime, type SimContextValue } from '../engine/simulation';
import { SCENARIOS, type ScenarioKey } from '../data/scenarios';

export type EvidenceKind = 'telemetry' | 'alert' | 'graph' | 'document';

export interface CopilotEvidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  meta?: string;
  score: number;
}

export interface CopilotAction {
  label: string;
  kind: 'navigate' | 'scenario' | 'prompt';
  value: string;
}

export interface PipelineStep {
  label: string;
  detail: string;
  ms: number;
}

export interface CopilotReply {
  id: string;
  intent: string;
  text: string;
  evidence: CopilotEvidence[];
  actions: CopilotAction[];
  followups: string[];
  confidence: number;
  pipeline: PipelineStep[];
}

interface Draft {
  intent: string;
  text: string;
  evidence: CopilotEvidence[];
  actions?: CopilotAction[];
  followups?: string[];
  confidence?: number;
  pipeline?: PipelineStep[];
}


const SCENARIO_WORDS: { key: ScenarioKey; keys: string[] }[] = [
  { key: 'storm', keys: ['暴雨', '洪涝', '强降雨', '洪水'] },
  { key: 'fire', keys: ['火情', '山火', '森林火', '林火'] },
  { key: 'pollution', keys: ['污染', '排污', '排口异常', '水质异常'] },
  { key: 'normal', keys: ['常态', '恢复正常'] },
];

function detectScenario(query: string): ScenarioKey | null {
  for (const item of SCENARIO_WORDS) {
    if (item.keys.some((key) => query.includes(key))) return item.key;
  }
  return null;
}

function scenarioSwitchAnswer(ctx: SimContextValue, target: ScenarioKey): Draft {
  const next = SCENARIOS[target];
  const already = target === ctx.scenarioKey;
  const env = next.environment;
  const text = `${already ? '当前已处于' : '准备进入'}「${next.name}」推演场景

场景配置
· 定位：${next.tagline}
· 环境驱动：气温 ${env.temperature}°C、湿度 ${env.humidity}%、风速 ${env.wind} m/s、PM2.5 ${env.pm25} µg/m³
· 水域参数：水位 ${env.waterLevel} m、浊度 ${env.turbidity} NTU、pH ${env.ph}
· 将触发：${next.triggers.join('；')}

预期联动
1. 仿真引擎更新多源遥测，规则引擎重新计算越限与空间事件；
2. 一张图同步设备状态、告警位置与无人系统任务；
3. 我将基于新场景继续生成风险研判、处置清单与巡检任务。

${already ? '场景已经就位，你可以直接继续追问，或让我重新推演一次。' : '点击下方「切换至' + next.name + '」执行场景注入。演示不会触发真实设备控制。'}

${next.agentAdvice}`;
  return {
    intent: '场景推演准备',
    text,
    evidence: uniqEvidence([
      docEvidence(`场景配置 · ${next.name}`, `${next.description} 触发条件：${next.triggers.join('；')}`, '仿真场景库'),
      telemetryEvidence(ctx),
      graphEvidence(getNode(target === 'fire' ? 'fire' : target === 'pollution' ? 'water' : 'spacetime')!),
    ]),
    actions: [
      { label: `切换至${next.name}`, kind: 'scenario', value: target },
      { label: '进入仿真沙盘', kind: 'navigate', value: '/simulation' },
      { label: '打开时空一张图', kind: 'navigate', value: '/map' },
    ],
    followups: ['切换后现在有哪些风险？', '生成该场景下的无人机任务', '对比当前场景与目标场景的差异'],
    confidence: 0.93,
    pipeline: basePipeline(ctx, '场景推演准备', [
      { label: '场景规则匹配', detail: `${ctx.scenario.name} → ${next.name}`, ms: 17 },
      { label: '环境参数注入预检', detail: `${Object.keys(env).length} 组参数 · ${next.triggers.length} 条触发规则`, ms: 23 },
    ]),
  };
}

const ALIASES: Record<string, string[]> = {
  传感器: ['sensor'],
  感知: ['sensor', 'edgeNode'],
  rfid: ['rfid'],
  视频: ['camera', 'cv'],
  摄像头: ['camera'],
  北斗: ['gnss', 'position'],
  gnss: ['gnss'],
  遥感: ['rs', 'remote'],
  卫星: ['rs', 'remote'],
  无人机: ['uav'],
  无人船: ['usv'],
  无人车: ['ugv'],
  边缘计算: ['edgeNode', 'gateway'],
  网关: ['gateway'],
  nbiot: ['nbiot'],
  'nb-iot': ['nbiot'],
  lora: ['lora'],
  lorawan: ['lora'],
  '5g': ['g5'],
  mqtt: ['mqtt'],
  coap: ['coap'],
  协议: ['mqtt', 'coap'],
  时序数据: ['stream', 'forecast'],
  流计算: ['stream'],
  gis: ['gis'],
  地理信息: ['gis'],
  地图: ['gis'],
  时空: ['spacetime'],
  数字孪生: ['twin'],
  电子围栏: ['geofence'],
  时空索引: ['sindex'],
  时空数据库: ['sdb'],
  轨迹: ['traj'],
  网格: ['grid'],
  知识图谱: ['kg'],
  图谱: ['kg'],
  大模型: ['llm'],
  rag: ['rag'],
  检索增强: ['rag'],
  智能体: ['agent', 'copilot'],
  agent: ['agent'],
  视觉识别: ['cv'],
  时序预测: ['forecast'],
  预测: ['forecast'],
  智慧水务: ['water'],
  水务: ['water'],
  水质: ['water'],
  森林防火: ['fire'],
  防火: ['fire'],
  巡检: ['inspection'],
  应急: ['emergency'],
  农业: ['agri'],
  城市治理: ['city'],
  生态: ['ecology'],
  零信任: ['zero'],
  安全: ['zero', 'auth'],
  隐私: ['privacy'],
  审计: ['audit'],
  平台层: ['access', 'stream', 'rules'],
  感知层: ['sensor'],
  网络层: ['mqtt', 'gateway'],
  物联网: ['root'],
  分层: ['root'],
  体系: ['root'],
  架构: ['root'],
};

const KNOWLEDGE_CUE = /什么是|原理|区别|对比|差异|比较|如何构建|怎么构建|为什么|概念|定义|架构|分层|支撑|关系|教材|论文|语料|知识来源|讲解|介绍一下|是什么|解释/;
const TELEMETRY_CUE = /当前|现在|实时|风险|告警|预警|态势|水位|水质|温度|湿度|pm2\.5|空气|设备|在线|离线|巡检|任务|调度|报告|简报|暴雨|洪水|山火|火情|污染|排口|移动|轨迹|过去|趋势|变化/;
const DISPATCH_CUE = /生成.*(任务|计划)|下发|派.*(机|船|车)|安排.*巡检|规划.*航线|巡检任务/;
const REPORT_CUE = /报告|简报|汇报|总结/;
const TREND_CUE = /趋势|过去.*(小时|分钟)|变化|走势|波动/;

const metricLabel: Record<string, string> = {
  temperature: '气温',
  humidity: '相对湿度',
  pm25: 'PM2.5',
  pm10: 'PM10',
  ph: 'pH',
  turbidity: '浊度',
  ammonia: '氨氮',
  level: '水位',
  oxygen: '溶解氧',
  moisture: '土壤含水率',
  soilTemperature: '土壤温度',
  ec: '电导率',
  displacement: '累计位移',
  crack: '裂缝宽度',
  tilt: '倾角',
  aiEvents: 'AI 事件',
  battery: '电量',
  altitude: '高度',
  speed: '速度',
  progress: '任务进度',
  connected: '连接节点',
  latency: '平均时延',
  throughput: '上行吞吐',
  resolution: '分辨率',
  cloud: '云量',
};

const metricUnit: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
  pm25: 'µg/m³',
  pm10: 'µg/m³',
  ph: '',
  turbidity: 'NTU',
  ammonia: 'mg/L',
  level: 'm',
  oxygen: 'mg/L',
  moisture: '%',
  soilTemperature: '°C',
  ec: 'µS/cm',
  displacement: 'mm',
  crack: 'mm',
  tilt: '°',
  aiEvents: '起',
  battery: '%',
  altitude: 'm',
  speed: 'm/s',
  progress: '%',
  connected: '个',
  latency: 'ms',
  throughput: 'msg/s',
  resolution: 'm',
  cloud: '%',
};

const statusLabel = { online: '在线', warning: '预警', offline: '离线' } as const;
const alertLevelLabel = { critical: '严重', warning: '警告', info: '提示' } as const;

const clean = (value: string) => value.replace(/[？?。！!，,]/g, ' ');

const nowTime = (ctx: SimContextValue) => formatSimTime(ctx.simTime).hm;
const timeLabel = (ctx: SimContextValue) => (ctx.speed === 1 ? '本地时间' : `加速仿真 ×${ctx.speed}`);

const activeAlerts = (ctx: SimContextValue) => ctx.alerts.filter((alert) => alert.status !== '已完成');

function alertEvidence(ctx: SimContextValue): CopilotEvidence[] {
  return activeAlerts(ctx)
    .slice(0, 3)
    .map((alert) => ({
      id: `alert-${alert.id}`,
      kind: 'alert' as const,
      title: alert.title,
      detail: `${alert.source} · ${alert.zone} · ${alert.detail}`,
      meta: `${alertLevelLabel[alert.level]} / ${alert.status}`,
      score: alert.level === 'critical' ? 0.97 : alert.level === 'warning' ? 0.9 : 0.78,
    }));
}

function telemetryEvidence(ctx: SimContextValue, title = '区域实时遥测快照', detail?: string): CopilotEvidence {
  return {
    id: 'telemetry-region',
    kind: 'telemetry',
    title,
    detail:
      detail ??
      `在线 ${ctx.stats.online}/${ctx.stats.total} · 气温 ${ctx.stats.avgTemperature}°C · 湿度 ${ctx.stats.avgHumidity}% · PM2.5 ${ctx.stats.avgPm25} µg/m³ · 平均水位 ${ctx.stats.avgWaterLevel} m`,
    meta: `${timeLabel(ctx)} ${nowTime(ctx)}`,
    score: 0.95,
  };
}

function graphEvidence(node: KnowledgeNode): CopilotEvidence {
  return {
    id: `graph-${node.id}`,
    kind: 'graph',
    title: node.name,
    detail: node.desc,
    meta: `${CATEGORY_META[node.category].label} · ${node.source}`,
    score: 0.9,
  };
}

function docEvidence(title: string, detail: string, meta = '课程知识体系'): CopilotEvidence {
  return { id: `doc-${title}`, kind: 'document', title, detail, meta, score: 0.84 };
}

function uniqEvidence(items: CopilotEvidence[]): CopilotEvidence[] {
  const map = new Map<string, CopilotEvidence>();
  items.forEach((item) => {
    if (!map.has(item.id)) map.set(item.id, item);
  });
  return [...map.values()].slice(0, 5);
}

function basePipeline(ctx: SimContextValue, intent: string, extra?: PipelineStep[]): PipelineStep[] {
  return [
    { label: '意图识别', detail: intent, ms: 14 },
    { label: '时空上下文装配', detail: `${ctx.scenario.name} · ${nowTime(ctx)} · ${ctx.stats.total} 个感知节点`, ms: 9 },
    { label: '遥测 / 告警检索', detail: `窗口内 ${ctx.alerts.length} 条事件 · ${ctx.stats.messageRate} msg/s`, ms: 32 },
    ...(extra ?? []),
    { label: '规则与权限校验', detail: '只读查询 · 人工确认后执行', ms: 11 },
    { label: '生成与引用绑定', detail: '证据链已关联到原始数据源', ms: 386 },
  ];
}

function findDevice(query: string) {
  const q = clean(query).toLowerCase();
  let bestDevice: (typeof DEVICES)[number] | null = null;
  let bestScore = 0;
  for (const device of DEVICES) {
    let score = 0;
    if (q.includes(device.id.toLowerCase())) score += 12;
    if (q.includes(device.shortName)) score += 8;
    if (q.includes(device.name)) score += 10;
    if (q.includes(device.zone) && (q.includes(KIND_META[device.kind].label.slice(0, 2)) || q.includes('站'))) score += 4;
    if (q.includes(device.zone)) score += 1;
    if (device.id === 'WQ-01' && q.includes('湟水河')) score += 6;
    if (device.id === 'WQ-03' && q.includes('水库')) score += 5;
    if (device.id === 'UAV-02' && q.includes('林场')) score += 4;
    if (device.id === 'UAV-01' && q.includes('平安驿')) score += 4;
    if (device.id === 'WQ-04' && (q.includes('排口') || q.includes('污水'))) score += 6;
    if (score > bestScore) {
      bestScore = score;
      bestDevice = device;
    }
  }
  return bestDevice && bestScore >= 4 ? bestDevice : null;
}

function readingLines(ctx: SimContextValue, device: (typeof DEVICES)[number]) {
  const reading = ctx.readings[device.id] ?? {};
  if (device.metrics.length) {
    return device.metrics.map((def) => {
      const value = reading[def.key];
      const digits = def.digits;
      return `${def.label} ${Number(value).toFixed(digits)}${def.unit}`;
    });
  }
  return Object.entries(reading)
    .filter(([key]) => metricLabel[key])
    .map(([key, value]) => `${metricLabel[key]} ${Number(value).toFixed(key === 'progress' || key === 'battery' ? 0 : 1)}${metricUnit[key]}`);
}

function deviceAnswer(ctx: SimContextValue, device: (typeof DEVICES)[number]): Draft {
  const status = ctx.deviceStatuses[device.id];
  const reading = ctx.readings[device.id] ?? {};
  const metrics = readingLines(ctx, device);
  const relatedNode =
    {
      weather: 'sensor',
      air: 'sensor',
      soil: 'sensor',
      geology: 'sensor',
      water: 'water',
      video: 'camera',
      drone: 'uav',
      ugv: 'ugv',
      usv: 'usv',
      satellite: 'rs',
      gateway: 'gateway',
    }[device.kind] ?? 'sensor';
  const node = getNode(relatedNode);
  const statusCopy =
    status === 'warning'
      ? '存在指标越限或趋势异常，建议进入仿真沙盘查看明细并触发工单。'
      : status === 'offline'
        ? '当前离线，平台显示的是最后一次有效观测；建议核查供电与边缘网关心跳。'
        : '运行平稳，数据链路与设备健康度正常。';
  const text = `【${device.name}】${statusLabel[status]}

· 设备编号：${device.id}
· 空间位置：${device.zone} · ${device.lng.toFixed(4)}°E / ${device.lat.toFixed(4)}°N
· 接入方式：${device.protocol} · 信号 ${device.signal}% · 电量 ${device.battery}%
· 最新观测：${metrics.length ? metrics.join('　') : '资产在线，无环境指标'}
· 设备研判：${statusCopy}

${status === 'warning' ? `当前场景「${ctx.scenario.name}」下，该设备被标记为预警设备，建议优先复核。` : `当前场景「${ctx.scenario.name}」下，该设备进入区域统一态势，数据已参与空间聚合。`}

如需进一步判断，我可以联动打开时空一张图，或生成针对该设备的巡检任务。`;

  return {
    intent: '设备状态问答',
    text,
    evidence: uniqEvidence([
      {
        id: `device-${device.id}`,
        kind: 'telemetry',
        title: `${device.shortName} · ${device.id}`,
        detail: metrics.join('　') || `状态：${statusLabel[status]}`,
        meta: `${device.protocol} / ${nowTime(ctx)}`,
        score: 0.96,
      },
      ...alertEvidence(ctx).filter((item) => item.title.includes(device.shortName) || item.detail.includes(device.id)),
      node ? graphEvidence(node) : docEvidence('设备物模型', '设备通过统一物模型接入，包含属性、事件与服务定义。'),
    ]),
    actions: [
      { label: '在地图中定位', kind: 'navigate', value: `/map?focus=${device.id}` },
      { label: '打开仿真沙盘', kind: 'navigate', value: '/simulation' },
    ],
    followups: ['该设备最近 3 分钟的变化趋势？', '还有哪些设备处于预警状态？', '生成一次针对该设备的巡检任务'],
    confidence: 0.94,
    pipeline: basePipeline(ctx, '设备状态问答', [
      { label: '设备影子读取', detail: `${device.id} · 最后上报 ${nowTime(ctx)}`, ms: 18 },
      { label: '阈值规则匹配', detail: `${device.metrics.length} 项指标 · 状态 ${statusLabel[status]}`, ms: 7 },
    ]),
  };
}

function riskAnswer(ctx: SimContextValue): Draft {
  const risks = activeAlerts(ctx);
  const critical = risks.filter((alert) => alert.level === 'critical');
  const warning = risks.filter((alert) => alert.level === 'warning');
  const riskLines = risks.length
    ? risks
        .slice(0, 4)
        .map(
          (alert, index) =>
            `${index + 1}. [${alertLevelLabel[alert.level]}] ${alert.title}（${alert.time} · ${alert.status}）\n   ${alert.detail}`,
        )
        .join('\n')
    : '当前没有活动告警，所有指标处于正常区间。';

  const actionsByScenario: Record<ScenarioKey, string[]> = {
    normal: [
      '保持 30 分钟级巡检节奏，重点关注污水厂排口浊度趋势。',
      '对离线设备 AQ-02 执行供电与链路的远程诊断。',
      '将高分六号过境影像与上次结果做变化检测。',
    ],
    storm: [
      '暂停河道低空航线，无人机切换高空巡航并提高返航风速阈值保护。',
      '对湟水河平安桥、东沟水库启动 10 分钟级加密监测。',
      '将峡群沟位移监测数据同步应急部门，做好人员转移预案。',
    ],
    fire: [
      '无人机切换热成像载荷，对热点坐标抵近复核并回传视频。',
      '开启林场电子围栏禁飞管控，保持应急通信链路畅通。',
      '结合风向与烟尘扩散模型，生成下风向人员健康提示。',
    ],
    pollution: [
      '立即调取排口视频并锁定异常排放时间窗。',
      '无人船在排口下游 200m、1km、3km 三个断面加密采样。',
      '启动污染扩散推演，向下游乡镇推送水质风险提示。',
    ],
  };

  const text = `当前区域态势 · ${ctx.scenario.name}（${nowTime(ctx)}）

区域健康度 ${Math.round(ctx.stats.regionHealth)}/100，设备在线率 ${ctx.stats.onlineRate.toFixed(1)}%，活动告警 ${risks.length} 条，其中严重 ${critical.length} 条、警告 ${warning.length} 条。

主要风险
${riskLines}

建议动作
${actionsByScenario[ctx.scenario.key].map((item, index) => `${index + 1}. ${item}`).join('\n')}

${ctx.scenario.agentAdvice}`;

  return {
    intent: '区域风险研判',
    text,
    evidence: uniqEvidence([
      ...alertEvidence(ctx),
      telemetryEvidence(ctx),
      graphEvidence(getNode('spacetime')!),
    ]),
    actions: [
      { label: '打开时空一张图', kind: 'navigate', value: '/map' },
      { label: '进入仿真沙盘', kind: 'navigate', value: '/simulation' },
      {
        label: ctx.scenario.key === 'normal' ? '推演暴雨洪涝' : '推演水质污染',
        kind: 'scenario',
        value: ctx.scenario.key === 'normal' ? 'storm' : 'pollution',
      },
    ],
    followups: ['哪个设备当前风险最高？', '生成一份区域风险简报', '切换至暴雨场景推演'],
    confidence: 0.95,
    pipeline: basePipeline(ctx, '区域风险研判', [
      { label: '告警相关性分析', detail: `${risks.length} 条活动告警 · ${critical.length} 条严重`, ms: 21 },
      { label: '时空规则推演', detail: '叠加水位、气象与地灾阈值', ms: 27 },
    ]),
  };
}

function deviceStatusAnswer(ctx: SimContextValue): Draft {
  const warning = DEVICES.filter((device) => ctx.deviceStatuses[device.id] === 'warning');
  const offline = DEVICES.filter((device) => ctx.deviceStatuses[device.id] === 'offline');
  const online = DEVICES.filter((device) => ctx.deviceStatuses[device.id] === 'online');
  const list = (items: typeof DEVICES) =>
    items.length ? items.map((device) => `${device.shortName}（${device.id}）`).join('、') : '无';
  const text = `设备在线态势（${nowTime(ctx)}）

· 接入节点 ${ctx.stats.total} 个，在线 ${online.length} 个，在线率 ${ctx.stats.onlineRate.toFixed(1)}%
· 预警设备 ${warning.length} 个：${list(warning)}
· 离线设备 ${offline.length} 个：${list(offline)}

${offline.length ? `离线节点 ${offline[0].shortName} 已生成运维工单，最后有效电量 ${offline[0].battery}%。` : '所有节点链路正常。'}
${warning.length ? `预警节点主要集中在：${[...new Set(warning.map((device) => device.zone))].join('、')}。` : ''}

边缘侧消息速率 ${ctx.stats.messageRate} msg/s，数据质量 ${ctx.stats.dataQuality}%。`;
  return {
    intent: '设备在线态势',
    text,
    evidence: uniqEvidence([
      telemetryEvidence(ctx),
      ...warning.slice(0, 2).map((device) => ({
        id: `warn-${device.id}`,
        kind: 'telemetry' as const,
        title: `${device.shortName} · 预警`,
        detail: readingLines(ctx, device).join('　'),
        meta: `${device.zone} · ${device.protocol}`,
        score: 0.92,
      })),
      ...offline.slice(0, 1).map((device) => ({
        id: `offline-${device.id}`,
        kind: 'alert' as const,
        title: `${device.shortName} · 离线`,
        detail: device.note ?? '设备心跳丢失',
        meta: `${device.zone} · 电量 ${device.battery}%`,
        score: 0.9,
      })),
      graphEvidence(getNode('observability')!),
    ]),
    actions: [
      { label: '打开设备仿真', kind: 'navigate', value: '/simulation' },
      { label: '查看知识图谱', kind: 'navigate', value: '/graph' },
    ],
    followups: ['离线设备可能的原因？', '预警设备的最新读数？', '边缘网关的运行状态如何？'],
    confidence: 0.92,
    pipeline: basePipeline(ctx, '设备在线态势', [
      { label: '设备影子批量读取', detail: `${ctx.stats.total} 个节点 · 状态聚合`, ms: 26 },
    ]),
  };
}

function waterAnswer(ctx: SimContextValue): Draft {
  const stations = DEVICES.filter((device) => device.kind === 'water');
  const rows = stations.map((device) => {
    const reading = ctx.readings[device.id] ?? {};
    return {
      device,
      ph: reading.ph ?? 0,
      turbidity: reading.turbidity ?? 0,
      ammonia: reading.ammonia ?? 0,
      level: reading.level ?? 0,
      oxygen: reading.oxygen ?? 0,
    };
  });
  const worst = [...rows].sort((a, b) => b.turbidity - a.turbidity)[0];
  const avg = (key: 'ph' | 'turbidity' | 'ammonia') =>
    (rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(key === 'turbidity' ? 0 : 2);
  const waterAlerts = activeAlerts(ctx).filter((alert) =>
    stations.some((station) => station.id === alert.source),
  );
  const headline =
    ctx.scenario.key === 'pollution'
      ? '排口异常排放已经形成污染带，下游断面同步响应，需要立即溯源。'
      : ctx.scenario.key === 'storm'
        ? '降雨驱动浊度与水位同步上升，首要风险是浊度冲击与岸坡失稳。'
        : ctx.scenario.key === 'fire'
          ? '火情对水体直接影响有限，但消防取水与灰烬入河需要提前防范。'
          : '水质总体稳定，污水厂排口的浊度缓升是唯一持续关注点。';
  const text = `水质专题分析（${ctx.scenario.name}）

${headline}

· 4 个水质站平均 pH ${avg('ph')}、平均浊度 ${avg('turbidity')} NTU、平均氨氮 ${avg('ammonia')} mg/L
· 最高浊度：${worst.device.shortName} ${worst.turbidity.toFixed(0)} NTU（pH ${worst.ph.toFixed(2)}）
· 平安桥断面：浊度 ${(ctx.readings['WQ-01']?.turbidity ?? 0).toFixed(0)} NTU，水位 ${(ctx.readings['WQ-01']?.level ?? 0).toFixed(2)} m
· 排口断面：pH ${(ctx.readings['WQ-04']?.ph ?? 0).toFixed(2)}，氨氮 ${(ctx.readings['WQ-04']?.ammonia ?? 0).toFixed(2)} mg/L

${waterAlerts.length ? `当前关联告警 ${waterAlerts.length} 条：${waterAlerts.map((alert) => alert.title).join('；')}。` : '当前无水质关联告警。'}

建议
1. ${ctx.scenario.key === 'pollution' ? '立即封控排口并调取视频证据，启动下游加密采样。' : '保持现有采样频次，对排口浊度趋势设置更灵敏的规则。'}
2. 以“浊度—氨氮—pH”三参数联合判断异常，避免单指标误报。
3. 结合高分六号影像做水体光谱反演，与浮标数据交叉验证。`;

  return {
    intent: '水质专题研判',
    text,
    evidence: uniqEvidence([
      {
        id: 'water-summary',
        kind: 'telemetry',
        title: '水质多站实时聚合',
        detail: rows
          .map((row) => `${row.device.shortName}: pH ${row.ph.toFixed(2)} / 浊度 ${row.turbidity.toFixed(0)} NTU`)
          .join('；'),
        meta: `${timeLabel(ctx)} ${nowTime(ctx)} · 4 站`,
        score: 0.96,
      },
      ...waterAlerts.slice(0, 2).map((alert) => ({
        id: `water-alert-${alert.id}`,
        kind: 'alert' as const,
        title: alert.title,
        detail: alert.detail,
        meta: `${alertLevelLabel[alert.level]} · ${alert.status}`,
        score: 0.94,
      })),
      graphEvidence(getNode('water')!),
      graphEvidence(getNode('usv')!),
    ]),
    actions: [
      { label: '查看水质一张图', kind: 'navigate', value: '/map?focus=WQ-01' },
      { label: '生成溯源采样任务', kind: 'prompt', value: '生成一次无人船水质溯源采样任务' },
      { label: '推演水质污染', kind: 'scenario', value: 'pollution' },
    ],
    followups: ['氨氮和 pH 的联合变化趋势？', '无人船采样任务如何规划？', '浊度异常可能由哪些因素引起？'],
    confidence: 0.93,
    pipeline: basePipeline(ctx, '水质专题研判', [
      { label: '多站指标对齐', detail: 'pH / 浊度 / 氨氮 / 水位', ms: 24 },
      { label: '时空异常聚焦', detail: `最大浊度站 ${worst.device.id}`, ms: 17 },
    ]),
  };
}

function weatherAnswer(ctx: SimContextValue): Draft {
  const stations = DEVICES.filter((device) => device.kind === 'weather' || device.kind === 'air');
  const lines = stations
    .filter((device) => ctx.deviceStatuses[device.id] !== 'offline')
    .map((device) => {
      const reading = ctx.readings[device.id] ?? {};
      return `${device.shortName}：${reading.temperature?.toFixed(1) ?? '--'}°C / ${reading.humidity?.toFixed(0) ?? '--'}%${reading.pm25 !== undefined ? ` / PM2.5 ${reading.pm25} µg/m³` : ''}`;
    });
  const fireRisk = ctx.stats.avgHumidity < 25 ? '高' : ctx.stats.avgHumidity < 40 ? '中' : '低';
  const text = `气象与空气质量（${ctx.scenario.name}）

· 区域平均气温 ${ctx.stats.avgTemperature}°C，平均湿度 ${ctx.stats.avgHumidity}%，平均 PM2.5 ${ctx.stats.avgPm25} µg/m³
· 森林火险气象等级：${fireRisk}
· 峡群林场：温度 ${(ctx.readings['WT-02']?.temperature ?? 0).toFixed(1)}°C，湿度 ${(ctx.readings['WT-02']?.humidity ?? 0).toFixed(0)}%，风速 ${(ctx.readings['WT-02']?.wind ?? 0).toFixed(1)} m/s

站点明细
${lines.join('\n')}

${ctx.scenario.key === 'fire' ? '当前林区处于高温低湿状态，热红外与视频烟感应进入高频扫描模式。' : ctx.scenario.key === 'storm' ? '强降雨和大风会影响无人机飞行包线，建议降低巡航高度并缩短单架次时长。' : '当前气象条件总体适合无人机巡检，保持例行任务即可。'}`;

  return {
    intent: '气象环境分析',
    text,
    evidence: uniqEvidence([
      telemetryEvidence(ctx),
      ...stations.slice(0, 2).map((device) => ({
        id: `weather-${device.id}`,
        kind: 'telemetry' as const,
        title: device.name,
        detail: readingLines(ctx, device).join('　'),
        meta: `${device.zone} · ${nowTime(ctx)}`,
        score: 0.93,
      })),
      graphEvidence(getNode('forecast')!),
    ]),
    actions: [
      { label: '打开一张图', kind: 'navigate', value: '/map?focus=WT-01' },
      { label: '生成巡检任务', kind: 'prompt', value: '生成一次无人机气象灾后巡检任务' },
    ],
    followups: ['未来 2 小时火险如何变化？', '风速对无人机任务有什么影响？', '空气质量异常的设备有哪些？'],
    confidence: 0.92,
    pipeline: basePipeline(ctx, '气象环境分析'),
  };
}

function dispatchAnswer(ctx: SimContextValue): Draft {
  const isFire = ctx.scenario.key === 'fire';
  const route = isFire ? FOREST_ROUTE : DRONE_ROUTE;
  const droneId = isFire ? 'UAV-02' : 'UAV-01';
  const drone = DEVICES.find((device) => device.id === droneId)!;
  const battery = ctx.readings[drone.id]?.battery ?? drone.battery;
  const isUSV = ctx.scenario.key === 'pollution';
  const weatherRisk = ctx.stats.avgHumidity > 88 ? '高湿环境，注意镜头结露与链路衰减；阵风超过 10 m/s 应暂停任务。' : '气象条件满足飞行约束。';
  const text = `建议任务 · 待人工确认（${nowTime(ctx)}）

任务名称：${isFire ? '峡群林场热源复核与火情侦察' : ctx.scenario.key === 'pollution' ? '排口下游污染带加密巡检' : '湟水河—边坡多源例行巡检'}
执行资产：${isFire ? 'UAV-02（M30T，热成像）' : 'UAV-01（M350 + H20T）'}${isUSV ? ' + USV-01（水质采样无人船）' : ''}
航线航点：${route.filter((_, index) => index > 0 && index < route.length - 1).map((point) => point.name).join(' → ')}
载荷动作：${isFire ? '热红外扫描、热点定位、可见光取证' : '多光谱拍照、悬停复核、视频回传'}
约束检查：电量 ${battery}% · 信号 ${drone.signal}% · ${weatherRisk}

执行步骤
1. 任务编排服务下发航线，校验禁飞区与电子围栏。
2. 边缘网关建立视频与遥测双通道，预置断网缓存策略。
3. 飞行器按航点执行动作，视觉模型实时识别异常目标。
4. 成果自动入库媒体资产库，关联任务、时间与空间位置。
5. 识别线索生成工单，人工确认后闭环处置。

说明：本演示不会真实下发指令；可在“时空一张图”中查看航线与模拟飞行。`;

  return {
    intent: '任务生成与调度',
    text,
    evidence: uniqEvidence([
      {
        id: `dispatch-${drone.id}`,
        kind: 'telemetry',
        title: `${drone.shortName} · 可调度`,
        detail: `电量 ${battery}% · 信号 ${drone.signal}% · 载荷 ${drone.model}`,
        meta: '任务编排前置检查',
        score: 0.95,
      },
      ...alertEvidence(ctx),
      graphEvidence(getNode('orchestration')!),
      graphEvidence(getNode('uav')!),
      graphEvidence(getNode('inspection')!),
    ]),
    actions: [
      { label: '在航线图中查看', kind: 'navigate', value: '/map' },
      { label: '进入仿真沙盘', kind: 'navigate', value: '/simulation' },
      { label: '检查飞行约束', kind: 'prompt', value: '当前气象条件对无人机飞行有什么影响？' },
    ],
    followups: ['这条航线的风险点在哪？', '巡检成果如何形成线索闭环？', '如果风速继续上升应该如何处理？'],
    confidence: 0.9,
    pipeline: basePipeline(ctx, '任务生成与调度', [
      { label: '资源与约束检查', detail: `${drone.id} · 电量 ${battery}% · 航点 ${route.length - 2}`, ms: 36 },
      { label: '图谱工具链', detail: '任务编排 ← 无人机 ← 巡检', ms: 18 },
    ]),
  };
}

function reportAnswer(ctx: SimContextValue): Draft {
  const critical = ctx.alerts.filter((alert) => alert.level === 'critical');
  const warning = ctx.alerts.filter((alert) => alert.level === 'warning');
  const text = `《平安区时空智能区域简报》
生成时间：${nowTime(ctx)} · 场景：${ctx.scenario.name}

一、总体态势
区域健康度 ${Math.round(ctx.stats.regionHealth)}/100。接入节点 ${ctx.stats.total} 个，在线 ${ctx.stats.online} 个，在线率 ${ctx.stats.onlineRate.toFixed(1)}%；当前活动告警 ${activeAlerts(ctx).length} 条，其中严重 ${critical.length} 条、警告 ${warning.length} 条。

二、感知网络
平均气温 ${ctx.stats.avgTemperature}°C，湿度 ${ctx.stats.avgHumidity}%，PM2.5 ${ctx.stats.avgPm25} µg/m³；水质站平均 pH ${ctx.stats.avgPh}，平均水位 ${ctx.stats.avgWaterLevel} m。消息速率 ${ctx.stats.messageRate} msg/s，数据质量 ${ctx.stats.dataQuality}%。

三、重点风险
${critical.length ? critical.map((alert) => `· ${alert.title}：${alert.detail}`).join('\n') : '· 当前无严重级别告警。'}
${warning.length ? warning.map((alert) => `· ${alert.title}：${alert.detail}`).join('\n') : ''}

四、无人系统
无人机、无人车、无人船与遥感卫星共 ${ctx.stats.unmannedActive} 套资产处于任务序列；高分六号已完成一次过境影像入库，无人机航线 ${ctx.scenario.key === 'fire' ? 'UAV-02 林火侦察' : 'UAV-01 河道巡检'} 正在执行。

五、建议
1. ${ctx.scenario.agentAdvice}
2. 对预警设备执行一次“数据—视频—现场”三方复核，避免单源误判。
3. 将本简报关联至值班日志，保留决策证据链。`;

  return {
    intent: '区域简报生成',
    text,
    evidence: uniqEvidence([
      telemetryEvidence(ctx),
      ...alertEvidence(ctx),
      docEvidence('时空智能简报模板', '结构：总体态势 / 感知网络 / 重点风险 / 无人系统 / 建议。', '方案知识库'),
    ]),
    actions: [
      { label: '返回态势总览', kind: 'navigate', value: '/' },
      { label: '打开一张图', kind: 'navigate', value: '/map' },
      { label: '生成处置任务', kind: 'prompt', value: '生成一次无人机巡检任务' },
    ],
    followups: ['把风险部分展开讲', '这份简报的数据来源是什么？', '生成下一时段的巡检建议'],
    confidence: 0.93,
    pipeline: basePipeline(ctx, '区域简报生成'),
  };
}

function trendAnswer(ctx: SimContextValue, query: string): Draft | null {
  const metrics = [
    { keys: ['温度', '气温'], field: 'temperature' as const, label: '气温', unit: '°C', digits: 1 },
    { keys: ['湿度'], field: 'humidity' as const, label: '相对湿度', unit: '%', digits: 0 },
    { keys: ['pm2.5', 'PM2.5', '空气'], field: 'pm25' as const, label: 'PM2.5', unit: 'µg/m³', digits: 0 },
    { keys: ['水位'], field: 'waterLevel' as const, label: '平均水位', unit: 'm', digits: 2 },
    { keys: ['浊度'], field: 'turbidity' as const, label: '浊度', unit: 'NTU', digits: 0 },
    { keys: ['ph', 'pH', '酸碱'], field: 'ph' as const, label: 'pH', unit: '', digits: 2 },
  ];
  const metric = metrics.find((item) => item.keys.some((key) => query.includes(key)));
  if (!metric) return null;
  const values = ctx.history.map((point) => point[metric.field]);
  const first = values[0];
  const last = values[values.length - 1];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const delta = last - first;
  const direction = Math.abs(delta) < 0.01 ? '基本持平' : delta > 0 ? '上升' : '下降';
  const firstPoint = ctx.history[0];
  const lastPoint = ctx.history[ctx.history.length - 1];
  const windowMinutes = Math.max(1, Math.round((lastPoint.ts - firstPoint.ts) / 60_000));
  const sampleSeconds = Math.max(1, Math.round((lastPoint.ts - firstPoint.ts) / Math.max(1, ctx.history.length - 1) / 1000));
  const text = `${metric.label}时序分析（近 ${windowMinutes} 分钟 · ${timeLabel(ctx)} · ${sampleSeconds} 秒采样）

· 起点 ${first.toFixed(metric.digits)}${metric.unit} → 当前 ${last.toFixed(metric.digits)}${metric.unit}，${direction} ${Math.abs(delta).toFixed(metric.digits)}${metric.unit}
· 区间最高 ${max.toFixed(metric.digits)}${metric.unit}，最低 ${min.toFixed(metric.digits)}${metric.unit}
· 当前场景「${ctx.scenario.name}」：${ctx.scenario.tagline}

${ctx.scenario.key !== 'normal' ? `场景切换已体现在时序曲线中，${metric.label}的变化方向与${ctx.scenario.name}的环境驱动一致。` : '曲线在正常波动区间内，没有出现阶跃式异常。'}

当前解析窗口为实时缓冲（${windowMinutes} 分钟 / ${sampleSeconds} 秒采样）；更长时段需要切换历史遥测库。`;

  const label = timeLabel(ctx);

  return {
    intent: '时空趋势分析',
    text,
    evidence: uniqEvidence([
      telemetryEvidence(ctx, `${metric.label} · 时序窗口`, `起点 ${first.toFixed(metric.digits)} → 当前 ${last.toFixed(metric.digits)}${metric.unit}；峰值 ${max.toFixed(metric.digits)}；窗口 ${windowMinutes} 分钟 · ${sampleSeconds}s 采样 · ${label}`),
      ...alertEvidence(ctx).slice(0, 2),
      graphEvidence(getNode('stream')!),
    ]),
    actions: [
      { label: '进入仿真沙盘', kind: 'navigate', value: '/simulation' },
      { label: '打开一张图', kind: 'navigate', value: '/map' },
    ],
    followups: ['与告警时间轴对齐分析', '这种变化是否正常？', '未来 1 小时可能怎么变化？'],
    confidence: 0.91,
    pipeline: basePipeline(ctx, '时空趋势分析', [
      { label: '时序窗口检索', detail: `${ctx.history.length} 个采样点 · ${sampleSeconds}s 粒度`, ms: 19 },
      { label: '变化点检测', detail: `差值 ${delta.toFixed(metric.digits)}${metric.unit}`, ms: 15 },
    ]),
  };
}

function retrieveKnowledge(query: string): KnowledgeNode[] {
  const q = query.toLowerCase();
  const scores = new Map<string, number>();
  KNOWLEDGE_NODES.forEach((node) => {
    let score = 0;
    if (q.includes(node.name.toLowerCase())) score += node.name.length * 3;
    Object.entries(ALIASES).forEach(([alias, ids]) => {
      if (q.includes(alias) && ids.includes(node.id)) score += alias.length >= 3 ? 8 : 5;
    });
    if (score > 0) scores.set(node.id, score);
  });
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => getNode(id))
    .filter((node): node is KnowledgeNode => Boolean(node));
}

function systemNote(node: KnowledgeNode, ctx: SimContextValue): string {
  if (node.id === 'kg') {
    return `演示图谱当前包含 ${GRAPH_STATS.nodes} 个实体、${GRAPH_STATS.links} 条关系，覆盖感知、网络、时空、平台、智能、应用与安全七个知识域；本轮回答引用的子图将教材概念与实时设备状态对齐。`;
  }
  if (node.id === 'llm' || node.id === 'copilot') {
    return `本系统的物联大模型采用“实时遥测 + 图谱子图 + 规则证据”的上下文装配方式，当前接入 ${ctx.stats.total} 个感知节点与 ${GRAPH_STATS.nodes} 个知识实体，所有回答都会绑定数据证据。`;
  }
  if (node.id === 'spacetime') {
    return `当前一张图以平安区湟水河流域为空间范围，实时缓冲保留近 3 分钟的 5 秒级遥测，空间对象与设备、事件通过统一时空索引关联。`;
  }
  if (node.id === 'uav') {
    return `当前 ${ctx.scenario.key === 'fire' ? 'UAV-02 正在执行林火侦察航线' : 'UAV-01 正在湟水河航线巡航'}，共 ${(ctx.scenario.key === 'fire' ? FOREST_ROUTE : DRONE_ROUTE).length} 个航点，遥测、视频与成果均与时空基准对齐。`;
  }
  if (node.id === 'water') {
    return `当前 4 个水质站平均 pH ${ctx.stats.avgPh}、平均水位 ${ctx.stats.avgWaterLevel} m；在「${ctx.scenario.name}」场景下，水质告警与无人船采样任务联动。`;
  }
  if (node.id === 'mqtt' || node.id === 'coap' || node.id === 'nbiot' || node.id === 'lora' || node.id === 'g5') {
    const count = DEVICES.filter((device) => device.protocol.toLowerCase().includes(node.name.toLowerCase().replace('网络切片', '').trim())).length;
    return count
      ? `在演示设备台账中，有 ${count} 个节点使用该协议链路，消息经边缘网关汇聚后写入时空数据库。`
      : '这一协议在当前演示中作为可选接入能力存在，可在设备接入层扩展。';
  }
  if (node.id === 'fire' || node.id === 'inspection' || node.id === 'emergency') {
    return `在「${ctx.scenario.name}」场景下，该应用已形成从感知、识别到处置的演示闭环。`;
  }
  return `该能力已纳入系统知识图谱，当前上下文为「${ctx.scenario.name}」，可与 ${ctx.stats.total} 个感知节点和实时事件进行关联。`;
}

function knowledgeAnswer(ctx: SimContextValue, query: string, nodes: KnowledgeNode[]): Draft {
  if (/教材|论文|语料|知识来源|数据来源/.test(query)) {
    return {
      intent: '知识来源说明',
      text: `关于知识来源，本演示采用两层语料：

· 课程知识层：按物联网体系架构组织的 7 个知识域、${GRAPH_STATS.nodes} 个概念实体与 ${GRAPH_STATS.links} 条关系，用于解释感知、网络、时空、平台、智能与应用之间的因果关系。
· 实时数据层：仿真设备遥测、告警与无人系统任务，用于把抽象概念落到平安区的具体时空对象上。

教材与论文的正确接入方式不是“整段塞给大模型”，而是：
1. 按章节与段落切分，保留来源与页码；
2. 抽取概念、方法、指标与它们之间的关系；
3. 与已有图谱做实体对齐，补充同义词与上下位关系；
4. 为每个实体生成向量索引，供 RAG 召回；
5. 回答时同时引用“概念出处 + 实时数据证据”。

当前演示未包含你的教材与论文原文，因此不会伪造具体页码或作者结论；把资料放入项目后，可在现有知识图谱数据层增量补充。`,
      evidence: [
        docEvidence('知识构建管线', '教材文本 → 章节切分 → 概念/关系抽取 → 实体对齐 → 图谱与向量索引', '方案知识库'),
        graphEvidence(getNode('kg')!),
        graphEvidence(getNode('rag')!),
        graphEvidence(getNode('metadata')!),
      ],
      actions: [
        { label: '打开知识图谱', kind: 'navigate', value: '/graph' },
        { label: '了解 RAG 机制', kind: 'prompt', value: 'RAG 如何降低大模型幻觉？' },
      ],
      followups: ['知识图谱包含哪些知识域？', '实时数据如何进入大模型上下文？', '教材概念如何与设备实体对齐？'],
      confidence: 0.9,
      pipeline: basePipeline(ctx, '知识来源说明', [
        { label: '文档与图谱检索', detail: '课程知识体系 · 实体对齐说明', ms: 22 },
      ]),
    };
  }

  if (/架构|分层|感知层|网络层|平台层|应用层|端边云|技术体系/.test(query)) {
    return {
      intent: '系统架构解释',
      text: `时空智能物联网采用“端—边—云—用”一体化架构，并在平台之上增加“时空语义层”和“物联智能层”。

1. 感知层：智能传感器、视频、北斗定位，以及无人机、无人车、无人船、遥感卫星构成的空天地移动感知网络。负责把物理世界转换为可计算的时空数据。
2. 网络层：MQTT / CoAP 负责设备消息，NB-IoT / LoRaWAN 覆盖低功耗广域场景，5G 切片保障视频与低时延控制，北斗短报文兜底无地面网络区域。
3. 边缘层：边缘网关完成协议转换、时空对齐、滑动窗口计算与本地推理，断网时缓存数据、恢复后续传。
4. 平台层：统一设备接入、时空数据库、流式计算、规则引擎、任务编排与媒体资产库，把多源数据组织成可查询、可调度的对象。
5. 智能层：知识图谱提供实体与关系，RAG 把实时数据、文档和图谱子图装配为大模型上下文，Agent 通过工具调用形成行动闭环。
6. 应用层：智慧水务、森林防火、无人机巡检、应急指挥、精准农业与城市治理。

在平安区的演示中：${ctx.stats.total} 个感知节点通过不同协议接入，${ctx.scenario.name}场景下的遥测、告警、无人系统任务与 ${GRAPH_STATS.nodes} 个知识实体共同参与回答。`,
      evidence: uniqEvidence([
        docEvidence('端边云用一体化架构', '感知层 → 网络层 → 边缘层 → 平台层 → 智能层 → 应用层，安全体系贯穿全栈。', '课程知识体系'),
        graphEvidence(getNode('root')!),
        graphEvidence(getNode('gateway')!),
        graphEvidence(getNode('kg')!),
        telemetryEvidence(ctx),
      ]),
      actions: [
        { label: '在知识图谱中查看', kind: 'navigate', value: '/graph?focus=root' },
        { label: '查看系统架构图', kind: 'prompt', value: '端边云用架构中，边缘层承担什么职责？' },
        { label: '打开一张图', kind: 'navigate', value: '/map' },
      ],
      followups: ['边缘层承担什么职责？', 'MQTT 与 CoAP 在架构中的位置？', '知识图谱位于哪一层？'],
      confidence: 0.93,
      pipeline: basePipeline(ctx, '系统架构解释', [
        { label: '架构知识召回', detail: '端 · 边 · 云 · 用 + 时空语义层', ms: 20 },
      ]),
    };
  }

  const compareCue = /区别|对比|差异|比较|选型|vs|VS/.test(query);
  if (compareCue && nodes.length >= 2) {
    const [a, b] = nodes;
    const relation = getNeighbors(a.id).find((neighbor) => neighbor.node.id === b.id);
    const propsA = Object.entries(a.props ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('，');
    const propsB = Object.entries(b.props ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('，');
    const text = `「${a.name}」与「${b.name}」对比

${a.name}（${CATEGORY_META[a.category].label}）
${a.desc}
关键属性：${propsA || '见知识图谱'}
对应场景：${systemNote(a, ctx)}

${b.name}（${CATEGORY_META[b.category].label}）
${b.desc}
关键属性：${propsB || '见知识图谱'}
对应场景：${systemNote(b, ctx)}

关系判断：${relation ? `图谱中存在直接关系「${a.name} —${relation.rel}→ ${b.name}」。` : '图谱中二者没有直接边，但在系统架构中通过平台层与时空数据层间接协同。'}
选型建议：面向弱网、低功耗、低频次遥测优先考虑低功耗广域方案；需要实时视频、低时延控制的场景采用蜂窝网络与边缘协同；协议选择要与设备资源、QoS 和服务端生态一起考虑。`;
    return {
      intent: '知识对比推理',
      text,
      evidence: uniqEvidence([graphEvidence(a), graphEvidence(b), docEvidence('物联网通信与协议选型', '按带宽、时延、功耗、覆盖与生态五个维度进行权衡。')]),
      actions: [
        { label: '在知识图谱中查看', kind: 'navigate', value: `/graph?focus=${a.id}` },
        { label: '查看协议接入方式', kind: 'prompt', value: 'MQTT 在系统中如何接入设备？' },
      ],
      followups: [`${a.name}与${b.name}在系统中的实际使用情况？`, '如何根据场景做协议选型？', '知识图谱如何表达这类关系？'],
      confidence: 0.91,
      pipeline: basePipeline(ctx, '知识对比推理', [
        { label: '图谱子图召回', detail: `${a.name} ↔ ${b.name}`, ms: 22 },
      ]),
    };
  }

  if (!nodes.length) return fallbackAnswer(ctx, query);

  const node = nodes[0];
  const neighbors = getNeighbors(node.id).slice(0, 6);
  const props = Object.entries(node.props ?? {})
    .map(([key, value]) => `· ${key}：${value}`)
    .join('\n');
  const related = neighbors
    .map((neighbor) => `${neighbor.direction === 'out' ? '→' : '←'} ${neighbor.node.name}（${neighbor.rel}）`)
    .join('　');
  const text = `【${node.name}】${CATEGORY_META[node.category].label}

${node.desc}

${props ? `关键属性\n${props}\n\n` : ''}图谱关系
${related || '暂无直接关联关系'}

系统映射
${systemNote(node, ctx)}

${nodes[1] ? `与「${nodes[1].name}」的关联：${
    getNeighbors(node.id).some((neighbor) => neighbor.node.id === nodes[1].id)
      ? '图谱中存在直接关系，可在知识图谱页面查看子图路径。'
      : '二者位于不同知识域，通过时空数据与平台能力间接协同。'
  }` : ''}`;

  return {
    intent: '图谱知识问答',
    text: text.trim(),
    evidence: uniqEvidence([
      graphEvidence(node),
      ...nodes.slice(1, 2).map(graphEvidence),
      docEvidence(`${CATEGORY_META[node.category].label}课程知识`, `${node.name}：${node.desc}`),
    ]),
    actions: [
      { label: '在知识图谱中展开', kind: 'navigate', value: `/graph?focus=${node.id}` },
      { label: '查看实时态势', kind: 'navigate', value: '/' },
      { label: '继续追问', kind: 'prompt', value: `${node.name}在平安区场景中如何应用？` },
    ],
    followups: [
      `${node.name}与实时数据如何关联？`,
      neighbors[0] ? `${node.name}与${neighbors[0].node.name}是什么关系？` : '知识图谱如何构建？',
      '用一张图解释物联网分层架构',
    ],
    confidence: 0.9,
    pipeline: basePipeline(ctx, '图谱知识问答', [
      { label: '图谱子图召回', detail: `${node.name} · ${neighbors.length} 个邻接实体`, ms: 24 },
    ]),
  };
}

function fallbackAnswer(ctx: SimContextValue, query: string): Draft {
  const topic = retrieveKnowledge(query)[0];
  const text = `我可以把你的问题落到“时空 + 物联 + 图谱 + 大模型”四层能力上。当前理解是：${query.trim()}。

当前平安区的实时状态：
· 场景：${ctx.scenario.name}，区域健康度 ${Math.round(ctx.stats.regionHealth)}/100
· 在线设备：${ctx.stats.online}/${ctx.stats.total}，活动告警 ${activeAlerts(ctx).length} 条
· 气象：${ctx.stats.avgTemperature}°C / 湿度 ${ctx.stats.avgHumidity}% / PM2.5 ${ctx.stats.avgPm25}
· 水域：平均 pH ${ctx.stats.avgPh}，平均水位 ${ctx.stats.avgWaterLevel} m

你可以让我做这些事：
1. 研判风险与告警，并给出处置建议；
2. 查询某个设备或断面的实时读数与趋势；
3. 生成无人机 / 无人船任务方案（演示不下发真实指令）；
4. 解释物联网与时空智能概念，并定位到知识图谱中的关系；
5. 生成区域简报或切换仿真场景进行推演。

${topic ? `如果你的问题与「${topic.name}」有关，可以直接问：“${topic.name}在本系统中怎么用？”` : '如果你能补充具体设备、区域或时间范围，我可以给出更精确的回答。'}`;

  return {
    intent: '通用问答',
    text,
    evidence: uniqEvidence([
      telemetryEvidence(ctx),
      ...(topic ? [graphEvidence(topic)] : []),
      ...alertEvidence(ctx).slice(0, 2),
    ]),
    actions: [
      { label: '打开态势总览', kind: 'navigate', value: '/' },
      { label: '浏览知识图谱', kind: 'navigate', value: '/graph' },
    ],
    followups: ['现在有哪些风险？', '分析一下湟水河水质', '生成一次无人机巡检任务'],
    confidence: 0.76,
    pipeline: basePipeline(ctx, '通用问答'),
  };
}

export function askCopilot(query: string, ctx: SimContextValue): CopilotReply {
  const normalized = query.trim();
  const lower = normalized.toLowerCase();
  const nodes = retrieveKnowledge(normalized);
  const conceptCue = KNOWLEDGE_CUE.test(normalized);
  const telemetryCue = TELEMETRY_CUE.test(normalized);
  let draft: Draft;

  if (DISPATCH_CUE.test(normalized)) {
    draft = dispatchAnswer(ctx);
  } else if (/教材|论文|语料|知识来源|数据来源/.test(normalized) && !telemetryCue) {
    draft = knowledgeAnswer(ctx, normalized, nodes);
  } else if (REPORT_CUE.test(normalized) && !conceptCue) {
    draft = reportAnswer(ctx);
  } else if (/(切换|切到|进入|推演|模拟|如果)/.test(normalized) && detectScenario(normalized)) {
    draft = scenarioSwitchAnswer(ctx, detectScenario(normalized)!);
  } else if (TREND_CUE.test(normalized) && telemetryCue) {
    draft = trendAnswer(ctx, normalized) ?? riskAnswer(ctx);
  } else if (conceptCue && !telemetryCue && nodes.length) {
    draft = knowledgeAnswer(ctx, normalized, nodes);
  } else if (/(设备|节点).*(在线|离线|状态|预警)|在线率|离线设备|哪些设备/.test(normalized)) {
    draft = deviceStatusAnswer(ctx);
  } else if (/(水质|水位|浊度|氨氮|ph|pH|水体|排口)/.test(normalized)) {
    draft = waterAnswer(ctx);
  } else if (/(温度|湿度|气象|风速|pm2\.5|PM2\.5|空气|天气)/.test(normalized)) {
    draft = weatherAnswer(ctx);
  } else if (/(风险|告警|预警|态势|应急|暴雨|洪水|山火|火情|污染)/.test(normalized)) {
    draft = riskAnswer(ctx);
  } else if (conceptCue && nodes.length) {
    draft = knowledgeAnswer(ctx, normalized, nodes);
  } else {
    const device = findDevice(normalized);
    draft = device ? deviceAnswer(ctx, device) : fallbackAnswer(ctx, normalized);
  }

  const id = `reply-${Date.now()}`;
  return {
    id,
    intent: draft.intent,
    text: draft.text,
    evidence: uniqEvidence(draft.evidence),
    actions: draft.actions ?? [
      { label: '打开一张图', kind: 'navigate', value: '/map' },
      { label: '查看知识图谱', kind: 'navigate', value: '/graph' },
    ],
    followups: draft.followups ?? ['现在有哪些风险？', '生成区域简报', '分析湟水河水质'],
    confidence: draft.confidence ?? 0.85,
    pipeline: draft.pipeline ?? basePipeline(ctx, draft.intent),
  };
}

export const COPILOT_SUGGESTIONS = [
  '现在平安区有哪些风险？',
  '分析湟水河水质并给出处置建议',
  '生成一次无人机巡检任务',
  '最近 3 分钟水位趋势如何变化？',
  '知识图谱如何支撑大模型？',
  '用一张图解释物联网分层架构',
  '比较 MQTT 与 CoAP 的适用场景',
  '生成一份区域态势简报',
];

export const COPILOT_MODEL = {
  name: 'IoT-Seer 1.0',
  mode: '本地演示推理',
  capabilities: ['时空上下文装配', '遥测与告警检索', '图谱子图推理', '工具调用建议'],
};
