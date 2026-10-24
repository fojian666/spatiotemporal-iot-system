import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Boxes,
  Check,
  ChevronRight,
  Circle,
  CloudCog,
  CloudDownload,
  Code2,
  Cpu,
  Database,
  FileJson,
  GitBranch,
  Minus,
  Radar,
  RadioTower,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '../components/Shell';
import { DeviceIcon, LevelPill, Panel, StatusPill, StatusText } from '../components/ui';
import { DEVICES, KIND_META, type DeviceDefinition, type DeviceKind, type MetricDef } from '../data/devices';
import { useSimulation } from '../engine/simulation';

/* ------------------------------------------------------------------ */
/* 自家平台产品能力定义                                                */
/* ------------------------------------------------------------------ */

type CapStatus = 'live' | 'demo' | 'plan';

const CAP_STATUS_META: Record<CapStatus, { label: string; className: string }> = {
  live: { label: '在线服务', className: 'pf-status--live' },
  demo: { label: '演示能力', className: 'pf-status--demo' },
  plan: { label: '规划中', className: 'pf-status--plan' },
};

const CAPABILITIES: {
  key: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  status: CapStatus;
  color: string;
  anchor?: string;
  to?: string;
}[] = [
  { key: 'access', name: '设备接入服务', desc: 'MQTT over TLS 统一接入，契约 v1 严格校验，QoS 1 送达保障', icon: RadioTower, status: 'live', color: '#4be1ff', anchor: 'console-flow' },
  { key: 'product', name: '产品与设备管理', desc: '产品线台账、设备实时影子与生命周期状态管理', icon: Boxes, status: 'live', color: '#23e6b0', anchor: 'console-products' },
  { key: 'tsl', name: '物模型 TSL', desc: '属性 / 事件 / 服务三段式物模型，阈值随产品定义下发', icon: FileJson, status: 'live', color: '#7aa2ff', anchor: 'console-tsl' },
  { key: 'rules', name: '规则引擎', desc: '阈值规则实时驱动设备状态机与告警事件生成', icon: Workflow, status: 'live', color: '#ffbc5c', anchor: 'console-rules' },
  { key: 'flow', name: '数据流转', desc: 'MQTT 上行 → WebSocket 秒级广播 → PostGIS 批量入库', icon: Send, status: 'live', color: '#5eead4', anchor: 'console-flow' },
  { key: 'open', name: '开放平台', desc: 'REST 28 端点 + WebSocket 推送，JWT 与三角色 RBAC 鉴权', icon: Code2, status: 'live', color: '#a78bfa', anchor: 'console-api' },
  { key: 'viz', name: '数据可视化', desc: '态势总览、时空一张图与仿真沙盘三屏联动', icon: Activity, status: 'live', color: '#ff84a8', to: '/' },
  { key: 'edge', name: '边缘协同', desc: '边缘网关协议转换、时空对齐与断网续传', icon: Cpu, status: 'demo', color: '#93c5fd', anchor: 'console-products' },
  { key: 'ai', name: 'AI 服务', desc: '物联大模型 Copilot，回答绑定遥测、告警与图谱证据链', icon: Sparkles, status: 'demo', color: '#f0abfc', to: '/copilot' },
  { key: 'ota', name: 'OTA 升级', desc: '设备固件远程升级与版本灰度策略', icon: CloudDownload, status: 'plan', color: '#8aa7c2' },
];

const API_GROUPS: { name: string; items: string[] }[] = [
  { name: '认证与安全', items: ['POST /api/auth/login', 'GET /api/auth/me', 'POST /api/auth/ws-ticket', 'POST /api/auth/logout'] },
  { name: '设备与遥测', items: ['GET /api/bootstrap', 'GET /api/devices', 'GET /api/devices/{id}', 'GET /api/telemetry/latest', 'GET /api/telemetry/history', 'WS /ws/telemetry'] },
  { name: '告警与场景', items: ['GET /api/alerts', 'GET /api/alerts/history', 'POST /api/alerts/{id}/ack', 'GET /api/scenarios', 'POST /api/scenarios/{key}', 'POST /api/simulation/state'] },
  { name: '空间与图谱', items: ['GET /api/spatial/nearby', 'GET /api/geo/devices', 'GET /api/geo/fences', 'GET /api/graph', 'GET /api/health'] },
  { name: '一网统飞', items: ['GET /api/drone/overview', 'POST /api/drone/routes', 'PUT /api/drone/routes/{id}', 'DELETE /api/drone/routes/{id}', 'POST /api/drone/plans', 'POST /api/drone/plans/{id}/command', 'PATCH /api/drone/clues/{id}'] },
];

const BOOK_MAP: { part: string; chapters: string; topic: string; module: string; to: string }[] = [
  { part: '第一篇 基础与体系', chapters: '第1–4章', topic: '对象-状态-事件模型、五层体系与智能闭环', module: '平台架构 / 物模型 TSL', to: '/platform' },
  { part: '第二篇 智能感知', chapters: '第5–10章', topic: '传感器、信号处理、遥感与组合导航、多源融合', module: '11 条产品线感知节点', to: '/simulation' },
  { part: '第三篇 通信与网络', chapters: '第11–14章', topic: '低功耗通信、网络协议、空天地一体化网络', module: '设备接入与数据流转', to: '/platform' },
  { part: '第四篇 时空数据', chapters: '第15–17章', topic: '时空数据库、云边端计算、GIS 处理', module: 'PostGIS 时空底座 / 一张图', to: '/map' },
  { part: '第五篇 时空智能', chapters: '第18–19章', topic: '时空数据学习、认知预测与智能决策', module: 'AI 服务 / 知识图谱', to: '/copilot' },
  { part: '第六篇 系统与应用', chapters: '第20章', topic: '时空数字孪生与系统应用', module: '仿真沙盘 / 一网统飞', to: '/drone' },
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
  const navigate = useNavigate();
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

  const rules = useMemo(
    () =>
      products.flatMap((p) =>
        p.properties.map((def) => ({
          id: `${p.kind}.${def.key}`,
          product: KIND_META[p.kind].label,
          warn:
            def.direction === 'low'
              ? `${def.label} ≤ ${def.warn}${def.unit}`
              : def.direction === 'range'
                ? `${def.label} < ${def.low ?? 0}${def.unit} 或 > ${def.warn}${def.unit}`
                : `${def.label} ≥ ${def.warn}${def.unit}`,
          crit: def.direction === 'low' ? `≤ ${def.crit}${def.unit}` : `≥ ${def.crit}${def.unit}`,
        })),
      ),
    [products],
  );

  const selected = products.find((p) => p.kind === productKind) ?? products[0];
  const services = SERVICES_BY_KIND[selected.kind] ?? [
    { name: '属性上报', desc: '周期上报 metrics（契约 v1）', real: true },
    { name: '事件上报', desc: '阈值/状态事件上抛', real: true },
  ];

  const liveRules = rules.length;
  const endpointCount = API_GROUPS.reduce((sum, g) => sum + g.items.length, 0);

  const openCapability = (cap: (typeof CAPABILITIES)[number]) => {
    if (cap.anchor) {
      document.getElementById(cap.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (cap.to) {
      navigate(cap.to);
    }
  };

  return (
    <div className="page platform-page">
      <PageHeader
        icon={CloudCog}
        overline="ST-IOT PLATFORM · PRODUCT CENTER"
        title="平台服务"
        description="平安区时空智能物联网平台的核心产品能力：设备接入、物模型、规则引擎、数据流转与开放平台"
        actions={
          <div className="model-status">
            <StatusPill tone="online" dot>平台运行中</StatusPill>
            <span className="mono">MQTT · WS · REST · POSTGIS</span>
          </div>
        }
      />

      <section className="pf-hero">
        <div className="pf-hero__grid" aria-hidden="true" />
        <div className="pf-hero__glow" aria-hidden="true" />
        <div className="pf-hero__main">
          <span className="overline">ONE PLATFORM · SENSING TO ACTION</span>
          <h2>从设备接入到智能决策的一站式物联网平台</h2>
          <p>
            平台以统一时空基准组织空天地 21 个感知节点与 5 套无人系统，提供设备接入、产品管理、
            物模型、规则引擎、数据流转与开放 API 全链路服务，支撑水务、防火、应急与低空巡检场景。
          </p>
          <div className="pf-hero__badges">
            <StatusPill tone="online" dot>MQTT TLS 已接入</StatusPill>
            <StatusPill tone="ai" dot>{liveRules} 条规则实时生效</StatusPill>
            <StatusPill tone="muted">{endpointCount} 个开放端点</StatusPill>
          </div>
        </div>
        <div className="pf-hero__stats">
          {[
            { label: '产品线', value: products.length, unit: '条' },
            { label: '在线设备', value: `${stats.online}/${stats.total}`, unit: '台' },
            { label: '启用规则', value: liveRules, unit: '条' },
            { label: '消息速率', value: stats.messageRate.toLocaleString(), unit: 'msg/s' },
          ].map((item) => (
            <div className="pf-stat" key={item.label}>
              <strong className="mono">{item.value}<em>{item.unit}</em></strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pf-caps">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          const meta = CAP_STATUS_META[cap.status];
          return (
            <button
              key={cap.key}
              type="button"
              className={`pf-cap ${cap.anchor || cap.to ? 'is-clickable' : ''}`}
              style={{ '--cap': cap.color } as CSSProperties}
              onClick={() => openCapability(cap)}
            >
              <span className="pf-cap__icon"><Icon size={18} /></span>
              <strong>{cap.name}</strong>
              <p>{cap.desc}</p>
              <span className={`pf-status ${meta.className}`}>
                {cap.status === 'live' ? <Check size={10} /> : cap.status === 'demo' ? <Circle size={8} /> : <Minus size={10} />}
                {meta.label}
              </span>
            </button>
          );
        })}
      </section>

      <section className="platform-grid">
        <div className="platform-main">
          <Panel
            id="console-products"
            overline="PRODUCT LIFECYCLE · DEVICE SHADOW"
            title="产品与设备管理"
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

          <Panel id="console-rules" overline="RULE ENGINE · THRESHOLD RULES" title="规则引擎" icon={Workflow}>
            <div className="platform-subhead">
              <span className="overline">规则清单</span>
              <span className="mono">{liveRules} 条已启用 · 每秒随遥测执行</span>
            </div>
            <div className="cap-matrix cap-matrix--tsl">
              <div className="cap-matrix__head cap-matrix__head--tsl pf-rules__head">
                <span>规则 ID</span><span>所属产品</span><span>预警条件</span><span>严重阈值</span><span>动作</span><span>状态</span>
              </div>
              {rules.map((rule) => (
                <div className="cap-matrix__row" key={rule.id}>
                  <strong className="mono">{rule.id}</strong>
                  <span>{rule.product}</span>
                  <span className="mono">{rule.warn}</span>
                  <span className="mono">{rule.crit}</span>
                  <span>状态置预警 · 生成告警事件</span>
                  <span className="cap-state cap-state--have"><Check size={10} />已启用</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel id="console-tsl" overline="THING MODEL · TSL" title={`物模型 · ${KIND_META[selected.kind].label}`} icon={FileJson}>
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
          <Panel id="console-flow" overline="ACCESS & DATA FLOW" title="设备接入与数据流转" icon={Send}>
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
              <div><ShieldCheck size={12} /><span>TLS + 账号 + ACL 设备级授权，支持独立设备账号</span></div>
              <div><Database size={12} /><span>非法消息拒收计数（messagesRejected），未知设备丢弃</span></div>
              <div><Radar size={12} /><span>支持切换只接收模式，真实设备直驱全链路</span></div>
            </div>
          </Panel>

          <Panel id="console-api" overline="OPEN PLATFORM" title="开放接口" icon={Code2}>
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

          <Panel overline="KNOWLEDGE SYSTEM · 教材衔接" title="知识体系" icon={GitBranch}>
            <div className="book-map">
              {BOOK_MAP.map((row) => (
                <Link className="book-map__row" key={row.part} to={row.to}>
                  <span className="book-map__part">{row.part}<em>{row.chapters}</em></span>
                  <span className="book-map__topic">{row.topic}</span>
                  <span className="book-map__module"><GitBranch size={11} />{row.module}</span>
                  <ChevronRight size={12} />
                </Link>
              ))}
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
