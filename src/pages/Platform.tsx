import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  Check,
  ChevronRight,
  Circle,
  CloudCog,
  Code2,
  Cpu,
  Database,
  FileJson,
  GitBranch,
  Minus,
  Radar,
  RadioTower,
  Route as RouteIcon,
  Send,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/Shell';
import { DeviceIcon, LevelPill, Panel, ProgressBar, StatusPill, StatusText } from '../components/ui';
import { DEVICES, KIND_META, type DeviceDefinition, type DeviceKind, type MetricDef } from '../data/devices';
import { useSimulation } from '../engine/simulation';

/* ------------------------------------------------------------------ */
/* 对标数据：OneNET / CTWing / 涂鸦 与本平台                          */
/* ------------------------------------------------------------------ */

type CapState = 'have' | 'partial' | 'plan';

const CAP_STATE_META: Record<CapState, { label: string; className: string }> = {
  have: { label: '已具备', className: 'cap-state--have' },
  partial: { label: '部分具备', className: 'cap-state--partial' },
  plan: { label: '规划中', className: 'cap-state--plan' },
};

const CAP_MATRIX: { name: string; onenet: string; ctwing: string; tuya: string; ours: CapState; note: string }[] = [
  { name: '设备接入', onenet: 'MQTT / NB-IoT 套件', ctwing: 'MQTT / HTTP / LwM2M / CoAP', tuya: 'TuyaOS / MCU / 网关接入', ours: 'partial', note: 'MQTT over TLS（契约 v1），LwM2M/CoAP 规划中' },
  { name: '产品与设备管理', onenet: '产品 → 设备台账', ctwing: '产品创建 / 生命周期', tuya: '创建产品 → 量产', ours: 'have', note: '按产品线组织的设备台账 + 实时影子' },
  { name: '物模型', onenet: '物模型（属性/事件/服务）', ctwing: '物模型定义', tuya: '功能定义（DP 点）', ours: 'partial', note: '属性模型带阈值已具备，服务下发为演示指令' },
  { name: '规则引擎', onenet: '规则引擎', ctwing: '规则引擎联动', tuya: '场景联动', ours: 'partial', note: '阈值规则驱动告警与状态机，复杂编排规划中' },
  { name: '数据流转', onenet: '消息队列 MQ', ctwing: '数据流转（天翼云/MQ）', tuya: '数据 Broker / 数据流', ours: 'have', note: 'MQTT 上行 + WebSocket 秒级广播 + PostGIS 落库' },
  { name: 'OTA 升级', onenet: '远程升级 OTA', ctwing: 'OTA 升级', tuya: 'OTA 固件管理', ours: 'plan', note: '预留：设备清单与版本字段可承载' },
  { name: '开放 API', onenet: '开放 API', ctwing: '能力开放网关', tuya: '云开发 API / IoT Core', ours: 'have', note: 'REST 34 端点 + WS，JWT/RBAC 鉴权' },
  { name: '数据可视化', onenet: 'View 可视化', ctwing: '行业组件大屏', tuya: '面板 / 小程序', ours: 'have', note: '态势总览 / 时空一张图 / 仿真沙盘' },
  { name: 'AI 能力', onenet: 'AI 能力平台', ctwing: '行业智能', tuya: '智能体开发', ours: 'partial', note: '规则引擎 Copilot（证据链），可替换真实模型' },
];

const API_GROUPS: { name: string; items: string[] }[] = [
  { name: '认证与安全', items: ['POST /api/auth/login', 'GET /api/auth/me', 'POST /api/auth/ws-ticket', 'POST /api/auth/logout'] },
  { name: '设备与遥测', items: ['GET /api/bootstrap', 'GET /api/devices', 'GET /api/devices/{id}', 'GET /api/telemetry/latest', 'GET /api/telemetry/history', 'WS /ws/telemetry'] },
  { name: '告警与场景', items: ['GET /api/alerts', 'GET /api/alerts/history', 'POST /api/alerts/{id}/ack', 'GET /api/scenarios', 'POST /api/scenarios/{key}', 'POST /api/simulation/state'] },
  { name: '空间与图谱', items: ['GET /api/spatial/nearby', 'GET /api/geo/devices', 'GET /api/geo/fences', 'GET /api/graph', 'GET /api/health'] },
  { name: '一网统飞', items: ['GET /api/drone/overview', 'POST /api/drone/routes', 'PUT /api/drone/routes/{id}', 'DELETE /api/drone/routes/{id}', 'POST /api/drone/plans', 'POST /api/drone/plans/{id}/command', 'PATCH /api/drone/clues/{id}'] },
];

const BOOK_MAP: { part: string; chapters: string; topic: string; module: string; to: string }[] = [
  { part: '第一篇 基础与体系', chapters: '第1–4章', topic: '对象-状态-事件模型、五层体系与智能闭环', module: '平台能力矩阵 / 系统架构', to: '/' },
  { part: '第二篇 智能感知', chapters: '第5–10章', topic: '传感器、信号处理、遥感与组合导航、多源融合', module: '设备台账 11 类感知节点', to: '/simulation' },
  { part: '第三篇 通信与网络', chapters: '第11–14章', topic: '低功耗通信、网络协议、空天地一体化网络', module: '接入与数据流转（MQTT/NB-IoT/LoRaWAN）', to: '/platform' },
  { part: '第四篇 时空数据', chapters: '第15–17章', topic: '时空数据库、云边端计算、GIS 处理', module: 'PostGIS 存储 / 时空一张图', to: '/map' },
  { part: '第五篇 时空智能', chapters: '第18–19章', topic: '时空数据学习、认知预测与智能决策', module: '物联大模型 Copilot / 知识图谱', to: '/copilot' },
  { part: '第六篇 系统与应用', chapters: '第20章', topic: '时空数字孪生与系统应用', module: '仿真沙盘场景推演 / 一网统飞', to: '/drone' },
];

const SERVICES_BY_KIND: Partial<Record<DeviceKind, { name: string; desc: string; real: boolean }[]>> = {
  drone: [
    { name: 'takeoff / pause / resume', desc: '飞行控制指令（真实 REST 状态机）', real: true },
    { name: 'hover / return / land', desc: '悬停、返航与降落指令', real: true },
    { name: '航线下发', desc: '按航点序列执行巡检任务', real: true },
  ],
  usv: [{ name: '采样任务下发', desc: '断面采样计划（演示联动）', real: false }],
  gateway: [{ name: '断网续传', desc: '本地缓存与恢复续传（演示）', real: false }],
};

const TSL_EVENTS = [
  { name: 'threshold.exceeded', level: 'critical' as const, desc: '指标越过严重阈值（crit）触发' },
  { name: 'threshold.warning', level: 'warning' as const, desc: '指标越过预警阈值（warn）触发' },
  { name: 'status.offline', level: 'info' as const, desc: '心跳丢失 / 只接收模式下未上报' },
];

/* ------------------------------------------------------------------ */
/* 页面                                                                */
/* ------------------------------------------------------------------ */

export function PlatformPage() {
  const { readings, deviceStatuses, stats } = useSimulation();
  const [productKind, setProductKind] = useState<DeviceKind>('water');

  const products = useMemo(() => {
    const groups = new Map<DeviceKind, DeviceDefinition[]>();
    DEVICES.forEach((device) => {
      groups.set(device.kind, [...(groups.get(device.kind) ?? []), device]);
    });
    return [...groups.entries()].map(([kind, devices]) => {
      const online = devices.filter((d) => deviceStatuses[d.id] !== 'offline').length;
      const protocols = [...new Set(devices.map((d) => d.protocol))];
      const properties = dedupeMetrics(devices);
      return { kind, devices, online, protocols, properties };
    });
  }, [deviceStatuses]);

  const selected = products.find((p) => p.kind === productKind) ?? products[0];
  const services = SERVICES_BY_KIND[selected.kind] ?? [
    { name: '属性上报', desc: '周期上报 metrics（契约 v1）', real: true },
    { name: '事件上报', desc: '阈值/状态事件上抛', real: true },
  ];

  return (
    <div className="page platform-page">
      <PageHeader
        icon={CloudCog}
        overline="IOT PLATFORM SERVICES · CONSOLE"
        title="平台服务"
        description="对标 OneNET / 天翼 CTWing / 涂鸦的平台能力形态：产品与设备、物模型、接入与数据流转、开放 API"
        actions={
          <div className="model-status">
            <StatusPill tone="online" dot>{stats.online}/{stats.total} 设备在线</StatusPill>
            <span className="mono">MQTT · WS · REST · POSTGIS</span>
          </div>
        }
      />

      <section className="cap-strip">
        {[
          { label: '产品线', value: products.length, unit: '类', icon: Boxes },
          { label: '接入设备', value: stats.total, unit: '台', icon: RadioTower },
          { label: '开放端点', value: API_GROUPS.reduce((sum, g) => sum + g.items.length, 0), unit: '个', icon: Code2 },
          { label: '教材映射', value: 20, unit: '章', icon: GitBranch },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div className="cap-kpi" key={item.label}>
              <span className="cap-kpi__icon"><Icon size={15} /></span>
              <div>
                <strong className="mono">{item.value}<em>{item.unit}</em></strong>
                <span>{item.label}</span>
              </div>
            </div>
          );
        })}
      </section>

      <Panel overline="BENCHMARK · ONENET / CTWING / TUYA" title="平台能力对标" icon={Workflow} className="cap-panel" noPad>
        <div className="cap-matrix">
          <div className="cap-matrix__head">
            <span>能力项</span><span>OneNET</span><span>CTWing</span><span>涂鸦</span><span>本平台</span><span>说明</span>
          </div>
          {CAP_MATRIX.map((row) => (
            <div className="cap-matrix__row" key={row.name}>
              <strong>{row.name}</strong>
              <span>{row.onenet}</span>
              <span>{row.ctwing}</span>
              <span>{row.tuya}</span>
              <span className={`cap-state ${CAP_STATE_META[row.ours].className}`}>
                {row.ours === 'have' ? <Check size={10} /> : row.ours === 'partial' ? <Circle size={8} /> : <Minus size={10} />}
                {CAP_STATE_META[row.ours].label}
              </span>
              <span className="cap-matrix__note">{row.note}</span>
            </div>
          ))}
        </div>
      </Panel>

      <section className="platform-grid">
        <div className="platform-main">
          <Panel
            overline="PRODUCTS & DEVICES"
            title="产品与设备"
            icon={Boxes}
            extra={<span className="mono detail-text">影子数据实时刷新</span>}
          >
            <div className="product-tabs">
              {products.map((p) => {
                const meta = KIND_META[p.kind];
                return (
                  <button
                    key={p.kind}
                    type="button"
                    className={`product-tab ${selected.kind === p.kind ? 'is-active' : ''}`}
                    style={{ '--pt': meta.color } as CSSProperties}
                    onClick={() => setProductKind(p.kind)}
                  >
                    <span className="product-tab__icon"><DeviceIcon kind={p.kind} size={14} /></span>
                    <span className="product-tab__name">{meta.label}</span>
                    <b className="mono">{p.online}/{p.devices.length}</b>
                  </button>
                );
              })}
            </div>

            <div className="product-summary">
              <div>
                <span>产品标识</span>
                <strong className="mono">{selected.kind.toUpperCase()}·{KIND_META[selected.kind].label}</strong>
              </div>
              <div>
                <span>接入协议</span>
                <strong>{selected.protocols.join(' / ')}</strong>
              </div>
              <div>
                <span>在线率</span>
                <strong className="mono">{Math.round((selected.online / selected.devices.length) * 100)}%</strong>
              </div>
              <div>
                <span>物模型属性</span>
                <strong className="mono">{selected.properties.length} 项</strong>
              </div>
            </div>

            <div className="device-table platform-devices">
              <div className="device-table__head platform-devices__head">
                <span>设备 / 编号</span><span>区域</span><span>设备影子（实时）</span><span>状态</span>
              </div>
              <div className="device-table__body">
                {selected.devices.map((device) => {
                  const reading = readings[device.id] ?? {};
                  const shadow = Object.entries(reading).slice(0, 4);
                  return (
                    <div className="platform-device__row" key={device.id}>
                      <span className="device-table__name">
                        <i style={{ color: KIND_META[device.kind].color }}><DeviceIcon kind={device.kind} size={15} /></i>
                        <span><strong>{device.shortName}</strong><em className="mono">{device.id}</em></span>
                      </span>
                      <span className="device-table__zone">{device.zone}</span>
                      <span className="platform-shadow mono">
                        {shadow.length
                          ? shadow.map(([key, value]) => `${key}=${value}`).join('  ')
                          : device.status === 'offline' ? '（离线 · 无上报）' : '—'}
                      </span>
                      <span><StatusText status={deviceStatuses[device.id] ?? device.status} /></span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          <Panel overline="THING MODEL · TSL" title={`物模型 · ${KIND_META[selected.kind].label}`} icon={FileJson}>
            <div className="platform-subhead"><span className="overline">属性（PROPERTIES）</span><span className="mono">{selected.properties.length} 项 · 类型 double · 带阈值</span></div>
            <div className="cap-matrix cap-matrix--tsl">
              <div className="cap-matrix__head cap-matrix__head--tsl">
                <span>标识符</span><span>名称</span><span>单位</span><span>预警阈值</span><span>严重阈值</span><span>判据方向</span>
              </div>
              {selected.properties.map((def) => (
                <div className="cap-matrix__row" key={def.key}>
                  <strong className="mono">{def.key}</strong>
                  <span>{def.label}</span>
                  <span className="mono">{def.unit || '—'}</span>
                  <span className="mono">{def.direction === 'low' ? '≤' : '≥'} {def.warn}</span>
                  <span className="mono">{def.direction === 'low' ? '≤' : '≥'} {def.crit}</span>
                  <span>{def.direction === 'high' ? '高限' : def.direction === 'low' ? '低限' : `区间 ${def.low ?? 0}~`}</span>
                </div>
              ))}
              {!selected.properties.length && <div className="cap-matrix__row"><span className="cap-matrix__note">该产品线为资产类设备，物模型以状态与事件为主（电量/信号/进度）。</span></div>}
            </div>
            <div className="platform-subhead"><span className="overline">事件（EVENTS）</span><span className="mono">阈值规则驱动</span></div>
            <div className="tsl-events">
              {TSL_EVENTS.map((event) => (
                <div className="tsl-event" key={event.name}>
                  <LevelPill level={event.level} />
                  <strong className="mono">{event.name}</strong>
                  <span>{event.desc}</span>
                </div>
              ))}
            </div>
            <div className="platform-subhead"><span className="overline">服务（SERVICES）</span><span className="mono">{services.filter((s) => s.real).length} 项真实下发</span></div>
            <div className="tsl-events">
              {services.map((service) => (
                <div className="tsl-event" key={service.name}>
                  <StatusPill tone={service.real ? 'online' : 'muted'}>{service.real ? 'REST' : '演示'}</StatusPill>
                  <strong className="mono">{service.name}</strong>
                  <span>{service.desc}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="platform-side">
          <Panel overline="ACCESS & DATA FLOW" title="接入与数据流转" icon={Send}>
            <div className="access-flow mono">
              <span>设备 / 仿真源</span><ChevronRight size={11} />
              <span>MQTT :8883 TLS</span><ChevronRight size={11} />
              <span>ingest 校验</span><ChevronRight size={11} />
              <span>WS 广播</span><ChevronRight size={11} />
              <span>PostGIS</span>
            </div>
            <div className="code-block mono">
              <span className="overline">TOPIC · QoS 1</span>
              <code>iot/pingan/devices/&#123;device_id&#125;/telemetry</code>
              <span className="overline">PAYLOAD · 契约 v1</span>
              <code>&#123; "version": 1, "device_id": "WQ-01",<br />&nbsp;&nbsp;"ts": "2026-10-24T10:00:00+08:00",<br />&nbsp;&nbsp;"metrics": &#123; "ph": 7.62, "turbidity": 18 &#125; &#125;</code>
            </div>
            <div className="platform-bullets">
              <div><ShieldCheck size={12} /><span>TLS + 账号 + ACL（readwrite iot/pingan/#），独立设备账号</span></div>
              <div><Database size={12} /><span>非法消息拒收计数（messagesRejected），未知设备丢弃</span></div>
              <div><Radar size={12} /><span>IOT_SIMULATION_ENABLED=false 切换为真实设备只接收模式</span></div>
            </div>
          </Panel>

          <Panel overline="OPEN API" title="开放接口" icon={Code2}>
            <div className="api-groups">
              {API_GROUPS.map((group) => (
                <div className="api-group" key={group.name}>
                  <span className="api-group__name">{group.name}</span>
                  <div className="api-group__items mono">
                    {group.items.map((item) => (
                      <span key={item} className={item.startsWith('WS') ? 'is-ws' : ''}>{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Link className="btn btn--sm btn--block" to="/copilot">在物联大模型中查询接口用法 <ChevronRight size={11} /></Link>
          </Panel>

          <Panel overline="TEXTBOOK MAPPING · 20261008 目录" title="教材章节映射" icon={GitBranch}>
            <div className="book-map">
              {BOOK_MAP.map((row) => (
                <Link className="book-map__row" key={row.part} to={row.to}>
                  <span className="book-map__part">{row.part}<em>{row.chapters}</em></span>
                  <span className="book-map__topic">{row.topic}</span>
                  <span className="book-map__module"><RouteIcon size={11} />{row.module}</span>
                  <ChevronRight size={12} />
                </Link>
              ))}
            </div>
            <div className="platform-bullets">
              <div><Cpu size={12} /><span>知识图谱 56 实体与教材知识链对应，Copilot 回答可溯源</span></div>
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function dedupeMetrics(devices: DeviceDefinition[]): MetricDef[] {
  const map = new Map<string, MetricDef>();
  devices.forEach((device) => device.metrics.forEach((def) => map.set(def.key, def)));
  return [...map.values()];
}

export type { LucideIcon };
