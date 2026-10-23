export type DeviceKind =
  | 'weather'
  | 'water'
  | 'soil'
  | 'geology'
  | 'air'
  | 'video'
  | 'drone'
  | 'ugv'
  | 'usv'
  | 'satellite'
  | 'gateway';

export type DeviceStatus = 'online' | 'warning' | 'offline';

export interface Device {
  id: string;
  name: string;
  shortName: string;
  kind: DeviceKind;
  zone: string;
  lng: number;
  lat: number;
  protocol: string;
  model: string;
  status: DeviceStatus;
  battery: number;
  signal: number;
  onlineSince?: string;
  note?: string;
}

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  digits: number;
  warn: number;
  crit: number;
  direction: 'high' | 'low' | 'range';
  low?: number;
  high?: number;
}

export type Reading = Record<string, number>;

export interface DeviceDefinition extends Device {
  metrics: MetricDef[];
}

export const KIND_META: Record<
  DeviceKind,
  { label: string; color: string; icon: string; group: string }
> = {
  weather: { label: '气象站', color: '#4be1ff', icon: 'cloud-sun', group: '地面感知' },
  water: { label: '水质/水文', color: '#38d9ff', icon: 'waves', group: '地面感知' },
  soil: { label: '土壤墒情', color: '#7ee787', icon: 'sprout', group: '地面感知' },
  geology: { label: '地质安全', color: '#ffbc5c', icon: 'mountain', group: '地面感知' },
  air: { label: '空气质量', color: '#a7f3d0', icon: 'wind', group: '地面感知' },
  video: { label: '视频点位', color: '#c4b5fd', icon: 'video', group: '视觉感知' },
  drone: { label: '无人机', color: '#5eead4', icon: 'plane', group: '无人系统' },
  ugv: { label: '无人车', color: '#93c5fd', icon: 'truck', group: '无人系统' },
  usv: { label: '无人船', color: '#67e8f9', icon: 'ship', group: '无人系统' },
  satellite: { label: '遥感卫星', color: '#f0abfc', icon: 'satellite', group: '天基感知' },
  gateway: { label: '边缘网关', color: '#fbbf24', icon: 'router', group: '网络设施' },
};

const M: Record<string, MetricDef> = {
  temp: { key: 'temperature', label: '气温', unit: '°C', digits: 1, warn: 32, crit: 36, direction: 'high' as const },
  humidity: { key: 'humidity', label: '相对湿度', unit: '%', digits: 0, warn: 90, crit: 96, direction: 'range', low: 25 },
  wind: { key: 'wind', label: '风速', unit: 'm/s', digits: 1, warn: 10, crit: 14, direction: 'high' as const },
  ph: { key: 'ph', label: 'pH', unit: '', digits: 2, warn: 8.6, crit: 9, direction: 'range', low: 6.2 },
  turbidity: { key: 'turbidity', label: '浊度', unit: 'NTU', digits: 0, warn: 45, crit: 90, direction: 'high' as const },
  ammonia: { key: 'ammonia', label: '氨氮', unit: 'mg/L', digits: 2, warn: 1, crit: 2, direction: 'high' as const },
  level: { key: 'level', label: '水位', unit: 'm', digits: 2, warn: 3.2, crit: 3.8, direction: 'high' as const },
  oxygen: { key: 'oxygen', label: '溶解氧', unit: 'mg/L', digits: 1, warn: 5, crit: 3, direction: 'low' as const },
  moisture: { key: 'moisture', label: '土壤含水率', unit: '%', digits: 0, warn: 20, crit: 12, direction: 'low' as const },
  soilTemp: { key: 'soilTemperature', label: '土壤温度', unit: '°C', digits: 1, warn: 33, crit: 38, direction: 'high' as const },
  ec: { key: 'ec', label: '电导率', unit: 'µS/cm', digits: 0, warn: 900, crit: 1400, direction: 'high' as const },
  pm25: { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', digits: 0, warn: 75, crit: 150, direction: 'high' as const },
  pm10: { key: 'pm10', label: 'PM10', unit: 'µg/m³', digits: 0, warn: 150, crit: 250, direction: 'high' as const },
  displacement: { key: 'displacement', label: '累计位移', unit: 'mm', digits: 1, warn: 8, crit: 15, direction: 'high' as const },
  crack: { key: 'crack', label: '裂缝宽度', unit: 'mm', digits: 2, warn: 3, crit: 6, direction: 'high' as const },
  tilt: { key: 'tilt', label: '倾角', unit: '°', digits: 2, warn: 1.5, crit: 3, direction: 'high' as const },
};

const BASE_DEVICES: DeviceDefinition[] = [
  {
    id: 'WT-01', name: '平安驿区域气象站', shortName: '平安驿气象', kind: 'weather', zone: '平安街道',
    lng: 102.1046, lat: 36.5081, protocol: 'LoRaWAN', model: 'WS-6A 六要素站',
    status: 'online', battery: 92, signal: 88, onlineSince: '近 63 天',
    metrics: [M.temp, M.humidity, M.wind, M.pm25],
  },
  {
    id: 'WT-02', name: '峡群林场小气候站', shortName: '峡群小气候', kind: 'weather', zone: '峡群林场',
    lng: 102.1547, lat: 36.4692, protocol: 'NB-IoT', model: 'HC-800 林区站',
    status: 'online', battery: 78, signal: 71, onlineSince: '近 41 天',
    metrics: [M.temp, M.humidity, M.wind, M.pm25],
  },
  {
    id: 'SL-01', name: '洪水泉土壤墒情站', shortName: '洪水泉墒情', kind: 'soil', zone: '洪水泉乡',
    lng: 102.0632, lat: 36.4738, protocol: 'NB-IoT', model: 'SM-4 墒情仪',
    status: 'online', battery: 64, signal: 63, onlineSince: '近 29 天',
    metrics: [M.moisture, M.soilTemp, M.ec],
  },
  {
    id: 'WQ-01', name: '湟水河平安桥水质站', shortName: '平安桥水质', kind: 'water', zone: '湟水河廊道',
    lng: 102.0751, lat: 36.5102, protocol: '5G / MQTT', model: 'WQ-9 多参数浮标',
    status: 'online', battery: 81, signal: 91, onlineSince: '近 120 天',
    metrics: [M.ph, M.turbidity, M.ammonia, M.level, M.oxygen],
  },
  {
    id: 'WQ-02', name: '白沈沟入河口监测站', shortName: '白沈沟入河', kind: 'water', zone: '三合镇',
    lng: 102.0918, lat: 36.494, protocol: 'NB-IoT', model: 'WQ-6 岸边站',
    status: 'online', battery: 73, signal: 76, onlineSince: '近 88 天',
    metrics: [M.ph, M.turbidity, M.ammonia, M.oxygen],
  },
  {
    id: 'WQ-03', name: '东沟水库水质浮标', shortName: '东沟水库', kind: 'water', zone: '东沟水库',
    lng: 102.1322, lat: 36.4803, protocol: '4G / MQTT', model: 'WQ-9 多参数浮标',
    status: 'online', battery: 89, signal: 82, onlineSince: '近 75 天',
    metrics: [M.ph, M.turbidity, M.level, M.oxygen],
  },
  {
    id: 'WQ-04', name: '污水处理厂排口站', shortName: '污水厂排口', kind: 'water', zone: '富硒产业园',
    lng: 102.1188, lat: 36.4865, protocol: '5G / Modbus', model: 'IP-8 工业排口机',
    status: 'warning', battery: 58, signal: 84, onlineSince: '近 132 天', note: '浊度近 24h 缓慢上升',
    metrics: [M.ph, M.turbidity, M.ammonia, M.level],
  },
  {
    id: 'AQ-01', name: '城区空气质量微站', shortName: '城区空气', kind: 'air', zone: '平安街道',
    lng: 102.1025, lat: 36.5025, protocol: 'LoRaWAN', model: 'AQ-4 微型站',
    status: 'online', battery: 85, signal: 90, onlineSince: '近 205 天',
    metrics: [M.pm25, M.pm10, M.temp, M.humidity],
  },
  {
    id: 'AQ-02', name: '富硒产业园空气站', shortName: '富硒园空气', kind: 'air', zone: '富硒产业园',
    lng: 102.1275, lat: 36.5115, protocol: 'NB-IoT', model: 'AQ-4 微型站',
    status: 'offline', battery: 12, signal: 0, note: '离线 · 边缘网关心跳丢失',
    metrics: [M.pm25, M.pm10, M.temp, M.humidity],
  },
  {
    id: 'SL-02', name: '祁家川边坡位移计', shortName: '祁家川边坡', kind: 'geology', zone: '三合镇',
    lng: 102.0834, lat: 36.481, protocol: 'LoRaWAN', model: 'GD-3 地质灾害仪',
    status: 'online', battery: 69, signal: 59, onlineSince: '近 56 天',
    metrics: [M.displacement, M.crack, M.tilt],
  },
  {
    id: 'SL-03', name: '峡群沟泥石流监测站', shortName: '峡群沟地灾', kind: 'geology', zone: '峡群林场',
    lng: 102.1425, lat: 36.4776, protocol: '北斗短报文', model: 'DF-7 泥石流站',
    status: 'online', battery: 74, signal: 52, onlineSince: '近 33 天',
    metrics: [M.displacement, M.crack, M.tilt],
  },
  {
    id: 'CAM-01', name: '平安驿高点视频', shortName: '平安驿视频', kind: 'video', zone: '平安街道',
    lng: 102.1061, lat: 36.5068, protocol: 'GB/T 28181', model: '球机 · 4K 45×',
    status: 'online', battery: 100, signal: 95, onlineSince: '近 360 天',
    metrics: [],
  },
  {
    id: 'CAM-02', name: '湟水河桥视频点位', shortName: '湟水河视频', kind: 'video', zone: '湟水河廊道',
    lng: 102.0771, lat: 36.5096, protocol: 'GB/T 28181', model: '枪机 · 4K',
    status: 'online', battery: 100, signal: 92, onlineSince: '近 360 天',
    metrics: [],
  },
  {
    id: 'CAM-03', name: '东沟水库视频点位', shortName: '东沟视频', kind: 'video', zone: '东沟水库',
    lng: 102.1301, lat: 36.4818, protocol: 'GB/T 28181', model: '球机 · 4K',
    status: 'online', battery: 100, signal: 79, onlineSince: '近 360 天',
    metrics: [],
  },
  {
    id: 'UAV-01', name: '无人机机场 · 平安驿', shortName: '平安驿机场', kind: 'drone', zone: '平安街道',
    lng: 102.0982, lat: 36.5056, protocol: '5G / MAVLink', model: 'M350 + H20T',
    status: 'online', battery: 86, signal: 96, onlineSince: '持续值守',
    metrics: [],
  },
  {
    id: 'UAV-02', name: '无人机 · 峡群林场', shortName: '峡群无人机', kind: 'drone', zone: '峡群林场',
    lng: 102.1502, lat: 36.4735, protocol: '4G / MAVLink', model: 'M30T 热成像',
    status: 'online', battery: 72, signal: 68, onlineSince: '持续值守',
    metrics: [],
  },
  {
    id: 'UGV-01', name: '巡护无人车 · 富硒园', shortName: '富硒园无人车', kind: 'ugv', zone: '富硒产业园',
    lng: 102.1241, lat: 36.509, protocol: '5G / ROS2', model: 'Rover-X 履带车',
    status: 'online', battery: 66, signal: 87, onlineSince: '近 6 小时',
    metrics: [],
  },
  {
    id: 'USV-01', name: '采样无人船 · 东沟水库', shortName: '东沟无人船', kind: 'usv', zone: '东沟水库',
    lng: 102.1338, lat: 36.479, protocol: '4G / MQTT', model: 'USV-2 采样船',
    status: 'online', battery: 47, signal: 74, onlineSince: '近 2 小时',
    metrics: [],
  },
  {
    id: 'SAT-01', name: '高分六号 · 过境任务', shortName: '高分六号', kind: 'satellite', zone: '天基',
    lng: 102.09, lat: 36.53, protocol: 'X 波段数传', model: 'GF-6 · 2m 多光谱',
    status: 'online', battery: 100, signal: 100, onlineSince: '过境窗口',
    metrics: [],
  },
  {
    id: 'GW-01', name: '边缘网关 · 平安街道', shortName: '平安边缘节点', kind: 'gateway', zone: '平安街道',
    lng: 102.1012, lat: 36.5032, protocol: 'MQTT / OPC UA', model: 'EdgeBox-500',
    status: 'online', battery: 100, signal: 99, onlineSince: '近 220 天',
    metrics: [],
  },
  {
    id: 'GW-02', name: '边缘网关 · 三合镇', shortName: '三合边缘节点', kind: 'gateway', zone: '三合镇',
    lng: 102.0852, lat: 36.4875, protocol: 'MQTT / CoAP', model: 'EdgeBox-500',
    status: 'online', battery: 100, signal: 93, onlineSince: '近 186 天',
    metrics: [],
  },
];

export interface RouteWaypoint {
  lng: number;
  lat: number;
  name: string;
  action?: string;
  altitude?: number;
}

const BASE_DRONE_ROUTE: RouteWaypoint[] = [
  { lng: 102.0982, lat: 36.5056, name: '平安驿机场', action: '自动起飞', altitude: 0 },
  { lng: 102.0918, lat: 36.5072, name: '白沈沟汇口', action: '水质复核', altitude: 120 },
  { lng: 102.0846, lat: 36.5094, name: '湟水河桥', action: '多光谱拍照', altitude: 120 },
  { lng: 102.0771, lat: 36.5096, name: '平安桥断面', action: '悬停采样', altitude: 90 },
  { lng: 102.0894, lat: 36.5035, name: '祁家川边坡', action: '边坡巡检', altitude: 140 },
  { lng: 102.1012, lat: 36.5028, name: '平安街道', action: '热成像扫描', altitude: 150 },
  { lng: 102.1112, lat: 36.5038, name: '富硒产业园', action: '巡航', altitude: 130 },
  { lng: 102.0982, lat: 36.5056, name: '平安驿机场', action: '自动降落', altitude: 0 },
];

const BASE_FOREST_ROUTE: RouteWaypoint[] = [
  { lng: 102.1502, lat: 36.4735, name: '峡群临时起降点', action: '垂直起飞', altitude: 0 },
  { lng: 102.1478, lat: 36.4788, name: '林场西坡', action: '热红外扫描', altitude: 180 },
  { lng: 102.1535, lat: 36.4832, name: '林场核心区', action: '热点复核', altitude: 160 },
  { lng: 102.1588, lat: 36.4784, name: '林场北沟', action: '烟雾识别', altitude: 180 },
  { lng: 102.1502, lat: 36.4735, name: '峡群临时起降点', action: '返航', altitude: 0 },
];

const BASE_UGV_ROUTE: RouteWaypoint[] = [
  { lng: 102.1241, lat: 36.509, name: '富硒园东门' },
  { lng: 102.1272, lat: 36.5074, name: '温室 3 号' },
  { lng: 102.1258, lat: 36.5052, name: '土壤采样点' },
  { lng: 102.1224, lat: 36.5063, name: '灌溉泵站' },
  { lng: 102.1241, lat: 36.509, name: '富硒园东门' },
];

const BASE_USV_ROUTE: RouteWaypoint[] = [
  { lng: 102.1338, lat: 36.479, name: '东沟码头' },
  { lng: 102.1361, lat: 36.4808, name: '库心采样点' },
  { lng: 102.1392, lat: 36.4793, name: '东岸剖面' },
  { lng: 102.1352, lat: 36.4778, name: '坝前监测点' },
  { lng: 102.1338, lat: 36.479, name: '东沟码头' },
];

export const AREA_CENTER: [number, number] = [102.111, 36.4935];

const BASE_FENCES = [
  {
    id: 'fence-water',
    name: '东沟水库水源保护区',
    level: '一级管控',
    color: '#4be1ff',
    coordinates: [
      [102.1248, 36.4848],
      [102.1302, 36.4869],
      [102.1385, 36.4858],
      [102.1421, 36.4811],
      [102.1371, 36.4752],
      [102.1288, 36.4749],
      [102.1239, 36.4789],
      [102.1248, 36.4848],
    ],
  },
  {
    id: 'fence-forest',
    name: '峡群林场防火核心区',
    level: '禁飞 / 限入',
    color: '#ffbc5c',
    coordinates: [
      [102.1442, 36.4892],
      [102.1542, 36.4915],
      [102.1622, 36.4851],
      [102.1601, 36.4734],
      [102.1492, 36.4698],
      [102.1428, 36.4762],
      [102.1442, 36.4892],
    ],
  },
];

export const ZONES = [
  { name: '平安街道', devices: 5, level: '核心区' },
  { name: '峡群林场', devices: 3, level: '生态区' },
  { name: '三合镇', devices: 3, level: '乡镇' },
  { name: '东沟水库', devices: 3, level: '水源地' },
  { name: '富硒产业园', devices: 3, level: '产业区' },
  { name: '湟水河廊道', devices: 2, level: '流域' },
  { name: '洪水泉乡', devices: 1, level: '农业区' },
  { name: '天基', devices: 1, level: '遥感' },
];

export const PROTOCOL_STATS = [
  { name: 'MQTT', value: 34, color: '#4be1ff' },
  { name: 'NB-IoT', value: 26, color: '#23e6b0' },
  { name: 'LoRaWAN', value: 19, color: '#7aa2ff' },
  { name: '5G / 4G', value: 14, color: '#a78bfa' },
  { name: '北斗 / 其他', value: 7, color: '#ffbc5c' },
];


// Demo geography is intentionally spread out for legibility; all coordinates remain
// inside the Ping'an district simulation envelope.
const SPREAD_LNG = 1.65;
const SPREAD_LAT = 1.05;
const ENVELOPE_CENTER = { lng: 102.111, lat: 36.4935 };

export function expandPoint(lng: number, lat: number): [number, number] {
  return [
    ENVELOPE_CENTER.lng + (lng - ENVELOPE_CENTER.lng) * SPREAD_LNG,
    ENVELOPE_CENTER.lat + (lat - ENVELOPE_CENTER.lat) * SPREAD_LAT,
  ];
}

function expandDevice(device: DeviceDefinition): DeviceDefinition {
  const [lng, lat] = expandPoint(device.lng, device.lat);
  return { ...device, lng, lat };
}

function expandWaypoint(point: RouteWaypoint): RouteWaypoint {
  const [lng, lat] = expandPoint(point.lng, point.lat);
  return { ...point, lng, lat };
}

export const DEVICES: DeviceDefinition[] = BASE_DEVICES.map(expandDevice);
export const DRONE_ROUTE: RouteWaypoint[] = BASE_DRONE_ROUTE.map(expandWaypoint);
export const FOREST_ROUTE: RouteWaypoint[] = BASE_FOREST_ROUTE.map(expandWaypoint);
export const UGV_ROUTE: RouteWaypoint[] = BASE_UGV_ROUTE.map(expandWaypoint);
export const USV_ROUTE: RouteWaypoint[] = BASE_USV_ROUTE.map(expandWaypoint);
export const FENCES = BASE_FENCES.map((fence) => ({
  ...fence,
  coordinates: fence.coordinates.map(([lng, lat]) => expandPoint(lng, lat)),
}));
