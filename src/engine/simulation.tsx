import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEVICES, type DeviceDefinition, type DeviceStatus, type MetricDef, type Reading } from '../data/devices';
import { SCENARIOS, type ScenarioConfig, type ScenarioKey } from '../data/scenarios';
import {
  REMOTE_ENABLED,
  connectTelemetrySocket,
  fetchBootstrap,
  postAlertAck,
  postScenario,
  postSimulationState,
  type ServerSnapshot,
} from '../services/api';
import { BootSplash } from '../components/BootSplash';

export type DataSource = 'local' | 'api';
export type LinkStatus = 'local' | 'live' | 'connecting' | 'reconnecting';

export type AlertLevel = 'critical' | 'warning' | 'info';
export type AlertStatus = '待处置' | '处置中' | '已完成';

export interface AlertItem {
  id: string;
  level: AlertLevel;
  title: string;
  source: string;
  zone: string;
  time: string;
  detail: string;
  status: AlertStatus;
}

export interface TrendPoint {
  ts: number;
  t: string;
  temperature: number;
  humidity: number;
  pm25: number;
  waterLevel: number;
  turbidity: number;
  ph: number;
}

export interface SimEvent {
  id: string;
  time: string;
  text: string;
  type: 'data' | 'alert' | 'task' | 'ai';
}

export interface SimStats {
  total: number;
  online: number;
  warning: number;
  offline: number;
  onlineRate: number;
  criticalAlerts: number;
  activeAlerts: number;
  unmannedActive: number;
  regionHealth: number;
  messageRate: number;
  avgTemperature: number;
  avgHumidity: number;
  avgPm25: number;
  avgWaterLevel: number;
  avgPh: number;
  todayTasks: number;
  dataQuality: number;
}

export interface SimContextValue {
  scenarioKey: ScenarioKey;
  scenario: ScenarioConfig;
  running: boolean;
  speed: number;
  tick: number;
  simTime: Date;
  readings: Record<string, Reading>;
  deviceStatuses: Record<string, DeviceStatus>;
  history: TrendPoint[];
  alerts: AlertItem[];
  events: SimEvent[];
  stats: SimStats;
  source: DataSource;
  linkStatus: LinkStatus;
  setScenario: (key: ScenarioKey) => Promise<boolean>;
  setRunning: (running: boolean) => void;
  setSpeed: (speed: number) => void;
  cycleAlert: (id: string) => void;
}

const SimulationContext = createContext<SimContextValue | null>(null);
const INITIAL_TIME = new Date();

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const shortClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const timeAgo = (base: Date, minutes: number) => clock(new Date(base.getTime() - minutes * 60_000));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 9973;
  return h;
}

function jitter(id: string, tick: number, amp: number) {
  const seed = hash(id);
  return Math.sin((tick + (seed % 31)) / 6.2 + seed) * amp * 0.65 + (((seed % 100) - 50) / 100) * amp;
}

function waterWeight(id: string) {
  if (id === 'WQ-04') return 1;
  if (id === 'WQ-02') return 0.7;
  if (id === 'WQ-01') return 0.55;
  return 0.3;
}

function computeReading(device: DeviceDefinition, tick: number, scenario: ScenarioConfig): Reading {
  const env = scenario.environment;
  const t = tick;
  const id = device.id;
  const noise = jitter(id, t, 1);

  switch (device.kind) {
    case 'weather': {
      const forest = device.zone === '峡群林场';
      return {
        temperature: +(env.temperature + (forest ? 0.9 : 0) + noise * 0.7 + Math.sin(t / 13) * 0.25).toFixed(1),
        humidity: +clamp(env.humidity + (forest ? -4 : 0) + noise * 3 + Math.sin(t / 11) * 1.5, 5, 100).toFixed(0),
        wind: +Math.max(0.2, env.wind + noise * 0.8).toFixed(1),
        pm25: +Math.max(1, env.pm25 + noise * 4).toFixed(0),
      };
    }
    case 'water': {
      const w = waterWeight(id);
      const isOutlet = id === 'WQ-04';
      const levelOffset = id === 'WQ-01' ? 0 : id === 'WQ-03' ? 0.7 : id === 'WQ-04' ? -0.85 : 0.08;
      const turbidity = 10 + env.turbidity * w + (isOutlet ? 18 : 0) + noise * 2.5;
      return {
        ph: +clamp(7.2 + (env.ph - 7.2) * w + noise * 0.05, 5.5, 10.5).toFixed(2),
        turbidity: +Math.max(1, turbidity).toFixed(0),
        ammonia: +Math.max(0.01, env.ammonia * w + (isOutlet ? 0.05 : 0) + noise * 0.02).toFixed(2),
        level: +Math.max(0.2, env.waterLevel + levelOffset + noise * 0.025).toFixed(2),
        oxygen: +clamp(9.4 - turbidity / 48 - env.ammonia * 0.3 + noise * 0.3, 1.2, 12).toFixed(1),
      };
    }
    case 'soil':
      return {
        moisture: +clamp(env.soilMoisture + noise * 3.5 + Math.sin(t / 15) * 0.8, 2, 100).toFixed(0),
        soilTemperature: +(env.temperature - 1.6 + noise * 0.5).toFixed(1),
        ec: +Math.max(80, 420 + env.soilMoisture * -1.2 + noise * 45).toFixed(0),
      };
    case 'air':
      return {
        pm25: +Math.max(1, env.pm25 + noise * 5).toFixed(0),
        pm10: +Math.max(2, env.pm25 * 1.65 + noise * 8).toFixed(0),
        temperature: +(env.temperature + noise * 0.4).toFixed(1),
        humidity: +clamp(env.humidity + noise * 2, 5, 100).toFixed(0),
      };
    case 'geology': {
      const risk = scenario.key === 'storm' ? (id === 'SL-03' ? 10.4 : 4.6) : scenario.key === 'fire' ? 0.8 : 0;
      return {
        displacement: +(2.2 + risk + noise * 0.25).toFixed(1),
        crack: +(0.82 + risk * 0.26 + noise * 0.02).toFixed(2),
        tilt: +(0.32 + risk * 0.09 + noise * 0.008).toFixed(2),
      };
    }
    case 'video':
      return {
        aiEvents:
          scenario.key === 'fire' ? (id === 'CAM-03' ? 3 : 1) : scenario.key === 'storm' ? 2 : scenario.key === 'pollution' ? 1 : 0,
      };
    case 'drone':
      return {
        battery: +clamp(device.battery - t * 0.01, 12, 100).toFixed(0),
        altitude: Math.round(96 + Math.sin(t / 6) * 24),
        speed: +(8.4 + Math.sin(t / 5) * 1.2).toFixed(1),
        progress: Math.min(99, 18 + (t * 1.2) % 80),
      };
    case 'ugv':
    case 'usv':
      return {
        battery: +clamp(device.battery - t * 0.008, 10, 100).toFixed(0),
        speed: +(2.1 + Math.sin(t / 7) * 0.6).toFixed(1),
        progress: Math.min(99, 34 + (t * 0.8) % 60),
      };
    case 'satellite':
      return { altitude: 561000, resolution: 2, cloud: 12, progress: Math.min(99, 22 + (t * 0.7) % 70) };
    case 'gateway':
      return {
        connected: 9 + (hash(id) % 4),
        latency: +(16 + Math.sin(t / 9) * 3 + (scenario.key === 'storm' ? 11 : 0)).toFixed(0),
        throughput: Math.round(1180 + Math.sin(t / 5) * 60 + (scenario.key === 'normal' ? 0 : 240)),
      };
    default:
      return {};
  }
}

export function metricState(def: MetricDef, value: number): 'normal' | 'warning' | 'critical' {
  if (def.direction === 'high') {
    if (value >= def.crit) return 'critical';
    if (value >= def.warn) return 'warning';
    return 'normal';
  }
  if (def.direction === 'low') {
    if (value <= def.crit) return 'critical';
    if (value <= def.warn) return 'warning';
    return 'normal';
  }
  if (value > def.crit || value < (def.low ?? 0) - 0.8) return 'critical';
  if (value > def.warn || value < (def.low ?? 0)) return 'warning';
  return 'normal';
}

function deriveStatus(device: DeviceDefinition, reading: Reading, scenarioKey: ScenarioKey): DeviceStatus {
  if (device.status === 'offline') return 'offline';
  if (!device.metrics.length) return 'online';
  if (device.id === 'WQ-04' && scenarioKey === 'normal') return 'warning';
  let status: DeviceStatus = 'online';
  for (const def of device.metrics) {
    const state = metricState(def, reading[def.key] ?? 0);
    if (state !== 'normal') status = 'warning';
  }
  return status;
}

function buildAlerts(key: ScenarioKey, base: Date): AlertItem[] {
  if (key === 'storm') {
    return [
      {
        id: 'storm-1',
        level: 'critical',
        title: '湟水河平安桥水位超警戒',
        source: 'WQ-01',
        zone: '湟水河廊道',
        time: timeAgo(base, 3),
        detail: '水位 3.91 m，超警戒 0.11 m，1h 涨幅 0.42 m；上游降雨仍在持续。',
        status: '处置中',
      },
      {
        id: 'storm-2',
        level: 'critical',
        title: '峡群沟位移速率异常',
        source: 'SL-03',
        zone: '峡群林场',
        time: timeAgo(base, 7),
        detail: '累计位移 12.7 mm，裂缝宽度 3.5 mm，触发泥石流黄色预警。',
        status: '待处置',
      },
      {
        id: 'storm-3',
        level: 'warning',
        title: '东沟水库水位持续上涨',
        source: 'WQ-03',
        zone: '东沟水库',
        time: timeAgo(base, 12),
        detail: '库水位 4.56 m，入库流量增大，建议加密巡查。',
        status: '待处置',
      },
      {
        id: 'storm-4',
        level: 'info',
        title: '无人机编队自动返航',
        source: 'UAV-01',
        zone: '平安街道',
        time: timeAgo(base, 14),
        detail: '阵风超过 10 m/s，任务自动中止，飞行器已安全返航。',
        status: '已完成',
      },
    ];
  }
  if (key === 'fire') {
    return [
      {
        id: 'fire-1',
        level: 'critical',
        title: '峡群林场发现高温热点',
        source: 'UAV-02',
        zone: '峡群林场',
        time: timeAgo(base, 2),
        detail: '热红外识别温差 41.8 ℃，热点已锁定在林场核心区，疑似地表火。',
        status: '处置中',
      },
      {
        id: 'fire-2',
        level: 'critical',
        title: 'PM2.5 峰值 286 µg/m³',
        source: 'AQ-01',
        zone: '平安街道',
        time: timeAgo(base, 5),
        detail: '烟尘向下风向扩散，AQI 爆表，建议发布健康提示。',
        status: '待处置',
      },
      {
        id: 'fire-3',
        level: 'warning',
        title: '林区相对湿度降至 16%',
        source: 'WT-02',
        zone: '峡群林场',
        time: timeAgo(base, 9),
        detail: '气温 34.5 ℃、风速 6.8 m/s，火险气象等级五级。',
        status: '处置中',
      },
      {
        id: 'fire-4',
        level: 'info',
        title: '无人机切换热成像载荷',
        source: 'UAV-02',
        zone: '峡群林场',
        time: timeAgo(base, 11),
        detail: '航线重规划完成，正在抵近热点区域执行复核。',
        status: '已完成',
      },
    ];
  }
  if (key === 'pollution') {
    return [
      {
        id: 'pollution-1',
        level: 'critical',
        title: '污水厂排口 pH 超标',
        source: 'WQ-04',
        zone: '富硒产业园',
        time: timeAgo(base, 2),
        detail: 'pH 9.31，超排放标准上限；浊度 186 NTU，氨氮 2.95 mg/L。',
        status: '处置中',
      },
      {
        id: 'pollution-2',
        level: 'critical',
        title: '下游断面氨氮异常',
        source: 'WQ-02',
        zone: '三合镇',
        time: timeAgo(base, 6),
        detail: '氨氮 2.08 mg/L，较基准值上升 12 倍，污染带向下游迁移。',
        status: '待处置',
      },
      {
        id: 'pollution-3',
        level: 'warning',
        title: '河道浊度上升 2.4 倍',
        source: 'WQ-01',
        zone: '湟水河廊道',
        time: timeAgo(base, 10),
        detail: '平安桥断面浊度 20 NTU，建议启动加密采样。',
        status: '待处置',
      },
      {
        id: 'pollution-4',
        level: 'info',
        title: '无人船采样任务已下发',
        source: 'USV-01',
        zone: '东沟水库',
        time: timeAgo(base, 13),
        detail: '已将排口下游 3 个断面加入采样计划。',
        status: '已完成',
      },
    ];
  }
  return [
    {
      id: 'normal-1',
      level: 'warning',
      title: '污水厂排口浊度缓慢上升',
      source: 'WQ-04',
      zone: '富硒产业园',
      time: timeAgo(base, 18),
      detail: '近 24h 浊度由 28 NTU 升至 46 NTU，尚未超阈值，建议安排巡检。',
      status: '处置中',
    },
    {
      id: 'normal-2',
      level: 'info',
      title: '无人机例行巡检完成',
      source: 'UAV-01',
      zone: '平安街道',
      time: timeAgo(base, 34),
      detail: '湟水河航线 8 个航点全部执行完成，采集影像 126 张。',
      status: '已完成',
    },
    {
      id: 'normal-3',
      level: 'info',
      title: 'AQ-02 设备离线',
      source: 'AQ-02',
      zone: '富硒产业园',
      time: timeAgo(base, 52),
      detail: '边缘网关心跳丢失，已自动生成运维工单。',
      status: '待处置',
    },
  ];
}

export const HISTORY_INTERVAL_MS = 5000;
export const HISTORY_SIZE = 36;

function initialHistory(now: Date): TrendPoint[] {
  const env = SCENARIOS.normal.environment;
  const start = now.getTime() - (HISTORY_SIZE - 1) * HISTORY_INTERVAL_MS;
  return Array.from({ length: HISTORY_SIZE }, (_, i) => {
    const time = new Date(start + i * HISTORY_INTERVAL_MS);
    const wave = Math.sin(i / 4.5);
    return {
      ts: time.getTime(),
      t: clock(time),
      temperature: +(env.temperature + wave * 0.55 + Math.sin(i / 8) * 0.25).toFixed(1),
      humidity: +(env.humidity + wave * 2.4).toFixed(0),
      pm25: +(env.pm25 + Math.sin(i / 4) * 3 + Math.sin(i / 11) * 2).toFixed(0),
      waterLevel: +(env.waterLevel + Math.sin(i / 6) * 0.025).toFixed(2),
      turbidity: +(env.turbidity + Math.sin(i / 5) * 2.4 + Math.sin(i / 9) * 1.2).toFixed(0),
      ph: +(env.ph + Math.sin(i / 7) * 0.02).toFixed(2),
    };
  });
}

const INITIAL_EVENTS: SimEvent[] = [
  { id: 'e1', time: timeAgo(INITIAL_TIME, 2), text: '边缘节点 GW-01 完成 1,248 条消息聚合与去重', type: 'data' },
  { id: 'e2', time: timeAgo(INITIAL_TIME, 5), text: '高分六号过境影像已入库，覆盖湟水河流域 186 km²', type: 'data' },
  { id: 'e3', time: timeAgo(INITIAL_TIME, 11), text: 'UAV-01 航线「湟水河例行巡检」执行完成', type: 'task' },
  { id: 'e4', time: timeAgo(INITIAL_TIME, 18), text: '规则引擎识别污水厂排口浊度缓慢上升', type: 'alert' },
  { id: 'e5', time: timeAgo(INITIAL_TIME, 26), text: '物联大模型生成《今日区域感知简报》', type: 'ai' },
  { id: 'e6', time: timeAgo(INITIAL_TIME, 41), text: '无人船 USV-01 完成东沟水库例行采样', type: 'task' },
];

function LocalSimulationProvider({ children }: { children: ReactNode }) {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>('normal');
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [simTime, setSimTime] = useState<Date>(INITIAL_TIME);
  const [history, setHistory] = useState<TrendPoint[]>(() => initialHistory(INITIAL_TIME));
  const [alerts, setAlerts] = useState<AlertItem[]>(() => buildAlerts('normal', INITIAL_TIME));
  const [events, setEvents] = useState<SimEvent[]>(INITIAL_EVENTS);
  const lastTickRef = useRef(0);
  const lastHistorySampleRef = useRef(INITIAL_TIME.getTime());
  const scenario = SCENARIOS[scenarioKey];

  const readings = useMemo(() => {
    const entries = DEVICES.map((device) => [device.id, computeReading(device, tick, SCENARIOS[scenarioKey])] as const);
    return Object.fromEntries(entries);
  }, [tick, scenarioKey]);

  const deviceStatuses = useMemo(() => {
    const entries = DEVICES.map((device) => [
      device.id,
      deriveStatus(device, readings[device.id] ?? {}, scenarioKey),
    ] as const);
    return Object.fromEntries(entries) as Record<string, DeviceStatus>;
  }, [readings, scenarioKey]);

  const advance = useCallback(() => {
    setSimTime((current) => {
      if (speed === 1) return new Date();
      return new Date(current.getTime() + 1000 * speed);
    });
    setTick((current) => current + 1);
  }, [speed]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(advance, 1000);
    return () => window.clearInterval(timer);
  }, [running, advance]);

  useEffect(() => {
    if (tick === 0 || tick === lastTickRef.current) return;
    lastTickRef.current = tick;
    const env = SCENARIOS[scenarioKey].environment;
    if (simTime.getTime() - lastHistorySampleRef.current >= HISTORY_INTERVAL_MS) {
      lastHistorySampleRef.current = simTime.getTime();
      setHistory((current) => {
        const point: TrendPoint = {
          ts: simTime.getTime(),
          t: clock(simTime),
          temperature: +(env.temperature + Math.sin(tick / 7) * 0.6).toFixed(1),
          humidity: +(env.humidity + Math.sin(tick / 5) * 3).toFixed(0),
          pm25: +Math.max(1, env.pm25 + Math.sin(tick / 4) * 4).toFixed(0),
          waterLevel: +(env.waterLevel + Math.sin(tick / 6) * 0.03).toFixed(2),
          turbidity: +Math.max(1, env.turbidity + Math.sin(tick / 5) * 4).toFixed(0),
          ph: +(env.ph + Math.sin(tick / 7) * 0.03).toFixed(2),
        };
        return [...current.slice(-(HISTORY_SIZE - 1)), point];
      });
    }
    if (tick % 9 === 0) {
      const templates: Record<ScenarioKey, string[]> = {
        normal: [
          'GW-02 完成本轮 CoAP 设备轮询，平均时延 18 ms',
          'UAV-01 任务进度更新，影像回传正常',
          '高分六号影像切片完成，时空索引已更新',
          '流式计算窗口触发，区域指标已更新',
        ],
        storm: [
          'WQ-01 水位连续 3 个周期超过警戒阈值',
          'SL-03 位移速率触发地质灾害规则',
          '无人机编队进入待命状态，链路保持在线',
          '下游断面加密监测任务已下发',
        ],
        fire: [
          'UAV-02 热成像画面进入实时识别通道',
          '烟火识别模型检出疑似烟点，等待复核',
          '林区气象站数据刷新，湿度持续下降',
          '应急指挥席位已接入一张图态势',
        ],
        pollution: [
          'WQ-04 排口数据触发排污异常规则',
          'USV-01 完成 2 个断面水样采集',
          '污染扩散模型完成首轮推演',
          '排口视频片段已关联至告警证据链',
        ],
      };
      const texts = templates[scenarioKey];
      const text = texts[tick % texts.length];
      setEvents((current) => [
        { id: `evt-${tick}`, time: clock(simTime), text, type: 'data' },
        ...current.slice(0, 7),
      ]);
    }
  }, [tick, scenarioKey, simTime]);

  const applyScenario = useCallback(
    async (key: ScenarioKey): Promise<boolean> => {
      setScenarioKey(key);
      setAlerts(buildAlerts(key, simTime));
      setEvents((current) => [
        {
          id: `scenario-${Date.now()}`,
          time: clock(simTime),
          text: `场景切换：${SCENARIOS[key].name}，仿真引擎注入 ${Object.keys(SCENARIOS[key].environment).length} 组环境参数`,
          type: 'ai',
        },
        ...current.slice(0, 7),
      ]);
      return true;
    },
    [simTime],
  );

  const cycleAlert = useCallback(
    (id: string) => {
      setAlerts((current) =>
        current.map((alert) => {
          if (alert.id !== id) return alert;
          const next: AlertStatus = alert.status === '待处置' ? '处置中' : alert.status === '处置中' ? '已完成' : '待处置';
          return { ...alert, status: next };
        }),
      );
      const target = alerts.find((a) => a.id === id);
      if (target) {
        setEvents((current) => [
          {
            id: `ack-${id}-${Date.now()}`,
            time: clock(simTime),
            text: `人工操作：${target.title} 状态已更新`,
            type: 'alert',
          },
          ...current.slice(0, 7),
        ]);
      }
    },
    [alerts, simTime],
  );

  const stats = useMemo<SimStats>(() => {
    const values = Object.values(deviceStatuses);
    const online = values.filter((s) => s !== 'offline').length;
    const warning = values.filter((s) => s === 'warning').length;
    const offline = values.filter((s) => s === 'offline').length;
    const criticalAlerts = alerts.filter((a) => a.level === 'critical').length;
    const activeAlerts = alerts.filter((a) => a.status !== '已完成').length;
    const weather = DEVICES.filter((d) => d.kind === 'weather' || d.kind === 'air');
    const water = DEVICES.filter((d) => d.kind === 'water');
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const reported = (devices: typeof DEVICES, key: 'temperature' | 'humidity' | 'pm25' | 'level' | 'ph') => {
      const values = devices
        .map((device) => readings[device.id]?.[key])
        .filter((value): value is number => typeof value === 'number');
      return avg(values);
    };
    const activeWarningAlerts = alerts.filter((a) => a.level === 'warning' && a.status !== '已完成').length;
    const regionHealth = Math.max(
      35,
      Math.min(99, 99 - warning * 3 - offline * 5 - criticalAlerts * 5 - activeWarningAlerts),
    );
    return {
      total: DEVICES.length,
      online,
      warning,
      offline,
      onlineRate: (online / DEVICES.length) * 100,
      criticalAlerts,
      activeAlerts,
      unmannedActive: DEVICES.filter((d) => ['drone', 'ugv', 'usv', 'satellite'].includes(d.kind)).length,
      regionHealth,
      messageRate: Math.round(1280 + Math.sin(tick / 5) * 48 + (scenarioKey === 'normal' ? 0 : 310)),
      avgTemperature: +reported(weather, 'temperature').toFixed(1),
      avgHumidity: Math.round(reported(weather, 'humidity')),
      avgPm25: Math.round(reported(weather.filter((d) => d.id !== 'AQ-02'), 'pm25')),
      avgWaterLevel: +reported(water, 'level').toFixed(2),
      avgPh: +reported(water, 'ph').toFixed(2),
      todayTasks: 24 + (scenarioKey === 'normal' ? 0 : 3),
      dataQuality: scenarioKey === 'normal' ? 98.4 : 96.7,
    };
  }, [deviceStatuses, alerts, readings, tick, scenarioKey]);

  const value: SimContextValue = {
    scenarioKey,
    scenario,
    running,
    speed,
    tick,
    simTime,
    readings,
    deviceStatuses,
    history,
    alerts,
    events,
    stats,
    source: 'local',
    linkStatus: 'local',
    setScenario: applyScenario,
    setRunning,
    setSpeed,
    cycleAlert,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

function RemoteSimulationProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ServerSnapshot | null>(null);
  const [phase, setPhase] = useState<'checking' | 'remote' | 'error'>('checking');
  const [linkStatus, setLinkStatus] = useState<Exclude<LinkStatus, 'local'>>('connecting');

  useEffect(() => {
    let cancelled = false;
    let revealTimer: number | undefined;
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2600);
    fetchBootstrap(controller.signal)
      .then((payload) => {
        if (cancelled) return;
        const remaining = Math.max(0, 420 - (performance.now() - startedAt));
        revealTimer = window.setTimeout(() => {
          if (cancelled) return;
          setSnapshot(payload);
          setPhase('remote');
        }, remaining);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Secure API bootstrap failed.', error);
        setPhase('error');
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
      if (revealTimer) window.clearTimeout(revealTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'remote') return undefined;
    return connectTelemetrySocket(
      (next) => setSnapshot(next),
      (status) => setLinkStatus(status),
    );
  }, [phase]);

  const applyScenario = useCallback(async (key: ScenarioKey): Promise<boolean> => {
    try {
      const next = await postScenario(key);
      setSnapshot(next);
      return true;
    } catch (error) {
      console.error('Scenario update failed', error);
      return false;
    }
  }, []);

  const applyRunning = useCallback((nextRunning: boolean) => {
    void postSimulationState({ running: nextRunning })
      .then((next) => setSnapshot(next))
      .catch((error) => console.error('Simulation state update failed', error));
  }, []);

  const applySpeed = useCallback((nextSpeed: number) => {
    void postSimulationState({ speed: nextSpeed })
      .then((next) => setSnapshot(next))
      .catch((error) => console.error('Simulation speed update failed', error));
  }, []);

  const ackAlert = useCallback((id: string) => {
    void postAlertAck(id)
      .then((next) => setSnapshot(next))
      .catch((error) => console.error('Alert acknowledgement failed', error));
  }, []);

  if (phase === 'checking') return <BootSplash title="正在接入服务端数据总线" detail="WSS · JWT · POSTGIS · MQTT" />;
  if (phase === 'error') {
    return (
      <div className="boot-splash">
        <div className="boot-splash__mark">
          <span />
          <span />
          <span />
        </div>
        <span className="overline">SECURE DATA BUS OFFLINE</span>
        <strong>无法建立安全数据通道</strong>
        <p>请检查 FastAPI :8443、证书信任状态与 MQTT-TLS。</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          重新连接
        </button>
      </div>
    );
  }
  if (!snapshot) return <BootSplash title="正在接入服务端数据总线" detail="WSS · JWT · POSTGIS · MQTT" />;

  const scenarioKey: ScenarioKey = snapshot.scenario_key in SCENARIOS ? snapshot.scenario_key : 'normal';
  const value: SimContextValue = {
    scenarioKey,
    scenario: SCENARIOS[scenarioKey],
    running: snapshot.running,
    speed: snapshot.speed,
    tick: snapshot.tick,
    simTime: new Date(snapshot.server_time),
    readings: snapshot.readings,
    deviceStatuses: snapshot.statuses,
    history: snapshot.history,
    alerts: snapshot.alerts,
    events: snapshot.events,
    stats: snapshot.stats,
    source: 'api',
    linkStatus,
    setScenario: applyScenario,
    setRunning: applyRunning,
    setSpeed: applySpeed,
    cycleAlert: ackAlert,
  };

  return <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>;
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  return REMOTE_ENABLED ? (
    <RemoteSimulationProvider>{children}</RemoteSimulationProvider>
  ) : (
    <LocalSimulationProvider>{children}</LocalSimulationProvider>
  );
}

export function useSimulation() {
  const context = useContext(SimulationContext);
  if (!context) throw new Error('useSimulation must be used inside SimulationProvider');
  return context;
}

export function formatSimTime(date: Date) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: clock(date),
    hm: shortClock(date),
    weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
  };
}
