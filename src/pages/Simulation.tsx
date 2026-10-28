import { useInvestigationView } from '../investigation/InvestigationProvider';
import { useScenarioRequest } from '../hooks/useScenarioRequest';
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  CloudRain,
  Droplets,
  Flame,
  FlaskConical,
  Gauge,
  MapPin,
  Pause,
  Play,
  Search,
  Sparkles,
  Waves,
  Wind,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { graphic, type EChartsOption } from '../lib/echarts';
import { PageHeader } from '../components/Shell';
import { EChart } from '../components/charts';
import {
  AnimatedMetric,
  DeviceIcon,
  EventIcon,
  Panel,
  Segmented,
  Sparkline,
  StatusPill,
  StatusText,
} from '../components/ui';
import { DEVICES, KIND_META, type DeviceKind } from '../data/devices';
import { SCENARIO_LIST, type ScenarioKey } from '../data/scenarios';
import { formatSimTime, metricState, useSimulation } from '../engine/simulation';
import { chartPalette, useTheme } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { usePageQuery } from '../hooks/usePageQuery';
import { usePageScroll } from '../hooks/usePageScroll';

const SCENARIO_ICONS: Record<ScenarioKey, LucideIcon> = {
  normal: Activity,
  storm: CloudRain,
  fire: Flame,
  pollution: Droplets,
};

type ChartGroup = 'water' | 'weather' | 'air' | 'geology';

const GROUP_META: Record<ChartGroup, { label: string; metric: string; unit: string; colors: string[]; kinds: DeviceKind[]; digits: number }> = {
  water: { label: '水质', metric: 'turbidity', unit: 'NTU', colors: ['#4be1ff', '#23e6b0', '#7aa2ff', '#ffbc5c'], kinds: ['water'], digits: 0 },
  weather: { label: '气象', metric: 'temperature', unit: '°C', colors: ['#4be1ff', '#7ee787'], kinds: ['weather'], digits: 1 },
  air: { label: '空气', metric: 'pm25', unit: 'µg/m³', colors: ['#ff8b6b', '#ffbc5c', '#a78bfa'], kinds: ['air', 'weather'], digits: 0 },
  geology: { label: '地灾', metric: 'displacement', unit: 'mm', colors: ['#ffbc5c', '#ff7a9e'], kinds: ['geology'], digits: 1 },
};

function seriesFor(value: number, tick: number, seed: number, amp: number, digits: number) {
  return Array.from({ length: 24 }, (_, index) => {
    const wave = Math.sin((index + tick) / 4.5 + seed) * amp;
    const drift = Math.sin((index + seed) / 11) * amp * 0.4;
    return Number((value + wave + drift).toFixed(digits));
  });
}

export function SimulationPage() {
  const {
    scenario,
    scenarioKey,
    running,
    setRunning,
    speed,
    setSpeed,
    simTime,
    readings,
    deviceStatuses,
    stats,
    events,
    tick,
    source,
    liveMode,
    linkStatus,
  } = useSimulation();
  const { canOperate } = useAuth();
  const scenarioRequest = useScenarioRequest();
  const [params, updateQuery] = usePageQuery();
  const pageRef = usePageScroll();
  const focus = DEVICES.find((device) => device.id === params.get('focus'));
  const selectedId = focus?.id ?? 'WQ-04';
  useInvestigationView('telemetry', selectedId);
  const defaultGroup: ChartGroup = focus?.kind === 'weather' ? 'weather' : focus?.kind === 'air' ? 'air' : focus?.kind === 'geology' ? 'geology' : 'water';
  const groupParam = params.get('chart');
  const chartGroup: ChartGroup = groupParam && Object.prototype.hasOwnProperty.call(GROUP_META, groupParam) ? groupParam as ChartGroup : defaultGroup;
  const filterParam = params.get('status');
  const filter = filterParam === 'online' || filterParam === 'warning' || filterParam === 'offline' ? filterParam : 'all';
  const search = params.get('search') ?? '';
  const theme = useTheme();
  const palette = useMemo(() => chartPalette(), [theme]);
  const time = formatSimTime(simTime);
  const selectedDevice = DEVICES.find((device) => device.id === selectedId) ?? DEVICES[0];
  const selectedReading = readings[selectedDevice.id] ?? {};
  const selectedStatus = deviceStatuses[selectedDevice.id];

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return DEVICES.filter((device) => {
      const statusMatch = filter === 'all' || deviceStatuses[device.id] === filter;
      const queryMatch =
        !query ||
        device.name.toLowerCase().includes(query) ||
        device.id.toLowerCase().includes(query) ||
        device.zone.toLowerCase().includes(query) ||
        KIND_META[device.kind].label.includes(query);
      return statusMatch && queryMatch;
    });
  }, [filter, search, deviceStatuses]);

  const chartOption = useMemo<EChartsOption>(() => {
    const meta = GROUP_META[chartGroup];
    const devices = DEVICES.filter((device) => meta.kinds.includes(device.kind) && deviceStatuses[device.id] !== 'offline' && readings[device.id]?.[meta.metric] !== undefined);
    const labels = liveMode ? [time.time.slice(0, 5)] : Array.from({ length: 24 }, (_, index) => {
      const minutes = (23 - index) * 2;
      const date = new Date(simTime.getTime() - minutes * 60_000);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    });
    return {
      backgroundColor: 'transparent',
      animationDuration: 650,
      animationEasing: 'cubicOut' as const,
      animationDurationUpdate: 550,
      animationEasingUpdate: 'cubicOut' as const,
      tooltip: {
        trigger: 'axis',
        backgroundColor: palette.tipBg,
        borderColor: palette.tipBorder,
        textStyle: { color: palette.tipText, fontSize: 11 },
        confine: true,
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(75,225,255,.3)' } },
      },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 9,
        itemHeight: 3,
        itemGap: 14,
        textStyle: { color: palette.label, fontSize: 10 },
      },
      /* left 加宽到 52：单位名改成竖排在轴左侧，需要让出它的位置。
         之前 name 用默认的 nameLocation:'end'，会被画在轴顶端上方，
         正好压在 legend 第一项上（"平安桥水质" × "NTU" 叠字）。 */
      grid: { top: 32, left: 52, right: 18, bottom: 24 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: palette.axisLine } },
        axisTick: { show: false },
        axisLabel: { color: palette.dim, fontSize: 9, interval: 3, fontFamily: 'SF Mono, monospace' },
      },
      yAxis: {
        type: 'value',
        name: meta.unit,
        /* 竖排在轴左侧中部，与右上角的 legend 彻底分开 */
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 34,
        nameTextStyle: { color: palette.dim, fontSize: 9 },
        axisLabel: { color: palette.dim, fontSize: 9 },
        splitLine: { lineStyle: { color: palette.grid } },
      },
      series: devices.map((device, index) => {
        const current = readings[device.id]?.[meta.metric] ?? 0;
        const color = meta.colors[index % meta.colors.length];
        return {
          id: device.id,
          name: device.shortName,
          type: 'line',
          smooth: true,
          symbol: liveMode ? 'circle' : 'none',
          symbolSize: liveMode ? 7 : undefined,
          data: liveMode ? [current] : seriesFor(current, tick, index * 1.7 + 1, meta.metric === 'temperature' ? 0.45 : meta.metric === 'turbidity' ? 4 : 0.18, meta.digits),
          lineStyle: { width: 1.5, color },
          areaStyle:
            !liveMode && index === 0
              ? {
                  color: new graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: `${color}33` },
                    { offset: 1, color: `${color}00` },
                  ]),
                }
              : undefined,
        };
      }),
    };
  }, [chartGroup, readings, tick, simTime, deviceStatuses, palette, liveMode, time.time]);

  const primaryMetric = (deviceId: string) => {
    const device = DEVICES.find((item) => item.id === deviceId)!;
    const reading = readings[deviceId] ?? {};
    if (!readings[deviceId]) return { label: '实时观测', value: '--' };
    if (!device.metrics.length) {
      if (liveMode) {
        const key = device.kind === 'video' ? 'aiEvents' : device.kind === 'gateway' ? 'connected' : device.kind === 'drone' ? 'progress' : 'battery';
        return { label: '实时观测', value: reading[key] === undefined ? '--' : String(reading[key]) };
      }
      if (device.kind === 'drone') return { label: '任务进度', value: `${Math.round(reading.progress ?? 64)}%` };
      if (device.kind === 'video') return { label: 'AI 事件', value: `${reading.aiEvents ?? 0} 起` };
      if (device.kind === 'gateway') return { label: '连接节点', value: `${reading.connected ?? 9} 个` };
      if (device.kind === 'satellite') return { label: '分辨率', value: '2 m' };
      return { label: '电量', value: `${reading.battery ?? device.battery}%` };
    }
    const def = device.metrics[0];
    return { label: def.label, value: reading[def.key] === undefined ? "--" : `${reading[def.key].toFixed(def.digits)}${def.unit}` };
  };

  const selectedMetricDefs = selectedDevice.metrics;
  const heroDef = selectedMetricDefs[0];
  const heroValue = heroDef ? Number(selectedReading[heroDef.key] ?? 0) : Number(selectedReading.battery ?? selectedDevice.battery);
  const heroMissing = !readings[selectedDevice.id] || (heroDef ? selectedReading[heroDef.key] === undefined : Boolean(liveMode && selectedReading.battery === undefined));
  const heroState = heroMissing ? 'normal' : heroDef ? metricState(heroDef, heroValue) : 'normal';

  return (
    <div ref={pageRef} className="page simulation-page">
      {scenarioRequest.error && <p role="alert" className="interaction-error">{scenarioRequest.error}</p>}
      <PageHeader
        icon={FlaskConical}
        overline={`IOT SIMULATION SANDBOX · TICK ${String(tick).padStart(4, '0')}`}
        title="物联仿真沙盘"
        description="以本地时钟驱动多源遥测，注入环境扰动，观察规则告警与无人系统的联动响应"
        actions={
          <div className="sim-controls">
            <button
              type="button"
              className={`btn ${running ? 'btn--ghost' : 'btn--primary'}`}
              onClick={() => setRunning(!running)}
              disabled={!canOperate || scenarioRequest.pending}
              title={canOperate ? undefined : '观察员为只读角色'}
            >
              {running ? <Pause size={14} /> : <Play size={14} />}
              {running ? '暂停仿真' : '继续仿真'}
            </button>
            {source === 'api' ? (
              <span className={`source-badge source-badge--${linkStatus === 'live' ? 'live' : 'reconnect'}`}>
                <Database size={12} /> FastAPI · MQTT {linkStatus === 'live' ? '实时' : '重连中'}
              </span>
            ) : (
              <Segmented
                value={speed}
                onChange={(value) => setSpeed(value)}
                options={[
                  { label: '实时', value: 1 },
                  { label: '2×', value: 2 },
                  { label: '4×', value: 4 },
                ]}
              />
            )}
            <div className="sim-clock">
              <span className={`sim-clock__label ${source === 'api' || (running && speed === 1) ? 'is-synced' : ''}`}>{source === 'api' ? (linkStatus === 'live' ? 'SERVER SYNC' : 'API LINK') : running && speed === 1 ? 'LOCAL SYNC' : 'SIM CLOCK'}</span>
              <strong className="mono">{time.time}</strong>
              <span>{time.date.replaceAll('-', '.')}</span>
            </div>
          </div>
        }
      />

      <section className="scenario-strip">
        {SCENARIO_LIST.map((item) => {
          const Icon = SCENARIO_ICONS[item.key];
          return (
            <button
              key={item.key}
              type="button"
              className={`scenario-card ${scenarioKey === item.key ? 'is-active' : ''}`}
              aria-pressed={scenarioKey === item.key}
              style={{ '--sc': item.color } as CSSProperties}
              onClick={() => void scenarioRequest.request(item.key)}
              disabled={!canOperate || scenarioRequest.pending}
              title={canOperate ? undefined : '观察员为只读角色'}
            >
              <div className="scenario-card__top">
                <span className="scenario-card__icon"><Icon size={16} /></span>
                <span className="scenario-card__code mono">{item.code}</span>
                <span className="scenario-card__state">{scenarioKey === item.key ? '● 注入中' : '点击注入'}</span>
              </div>
              <div className="scenario-card__title">
                <strong>{item.name}</strong>
                <span className={`severity severity--${item.severity === '常态' ? 'normal' : item.severity === '关注' ? 'watch' : item.severity === '严重' ? 'severe' : 'critical'}`}>{item.severity}</span>
              </div>
              <p>{item.tagline}</p>
              <div className="scenario-card__triggers">
                {item.triggers.slice(0, 2).map((trigger) => (
                  <span key={trigger}>{trigger}</span>
                ))}
              </div>
            </button>
          );
        })}
      </section>

      <div className="env-ribbon">
        <span className="env-ribbon__title"><Gauge size={13} /> 环境驱动参数</span>
        {[
          { label: '气温', value: scenario.environment.temperature, unit: '°C' },
          { label: '湿度', value: scenario.environment.humidity, unit: '%' },
          { label: '风速', value: scenario.environment.wind, unit: 'm/s' },
          { label: 'PM2.5', value: scenario.environment.pm25, unit: 'µg/m³' },
          { label: '水位', value: scenario.environment.waterLevel, unit: 'm' },
          { label: '浊度', value: scenario.environment.turbidity, unit: 'NTU' },
          { label: 'pH', value: scenario.environment.ph, unit: '' },
        ].map((item) => (
          <div className="env-param" key={item.label}>
            <span>{item.label}</span>
            <strong className="mono"><AnimatedMetric value={item.value} digits={2} /><em>{item.unit}</em></strong>
          </div>
        ))}
        <div className="env-ribbon__spacer" />
        <div className="env-ribbon__engine">
          <StatusPill tone={running ? 'online' : 'muted'} dot>{running ? '引擎运行中' : '引擎暂停'}</StatusPill>
          <span className="mono">{stats.messageRate.toLocaleString()} msg/s</span>
          <span className="mono">数据质量 {stats.dataQuality}%</span>
          <span className="mono">{source === 'api' ? (linkStatus === 'live' ? 'FASTAPI · 1s' : 'API RECONNECT') : running ? (speed === 1 ? 'LOCAL · 1s' : `ACCEL ×${speed}`) : 'PAUSED'}</span>
        </div>
      </div>

      <Panel className="pipeline-panel" noPad>
        <div className="pipeline">
          <div className="pipeline-stage">
            <span className="pipeline-stage__label">PERCEPTION / 感知层</span>
            <div className="pipeline-stage__card">
              <span className="pipeline-stage__icon" style={{ color: '#4be1ff' }}><Activity size={17} /></span>
              <div>
                <strong>{stats.online} 个节点在线</strong>
                <span>传感器 · 视频 · 无人系统 · 北斗</span>
              </div>
              <em className="mono">{stats.total} NODES</em>
            </div>
          </div>
          <div className="pipeline-flow">
            <span>MQTT / NB-IoT</span>
            <div><i /></div>
            <em className="mono">↓ 1.2k msg/s</em>
          </div>
          <div className="pipeline-stage">
            <span className="pipeline-stage__label">EDGE / 边缘层</span>
            <div className="pipeline-stage__card">
              <span className="pipeline-stage__icon" style={{ color: '#7aa2ff' }}><Wind size={17} /></span>
              <div>
                <strong>GW-01 / GW-02</strong>
                <span>协议转换 · 时空对齐 · 本地推理</span>
              </div>
              <em className="mono">{readings['GW-01']?.latency ?? (liveMode ? '--' : 18)} MS</em>
            </div>
          </div>
          <div className="pipeline-flow">
            <span>时空消息</span>
            <div><i /></div>
            <em className="mono">↓ {liveMode && !DEVICES.some(device => device.kind === 'water' && readings[device.id]?.level !== undefined) ? '--' : `${stats.avgWaterLevel} m`}</em>
          </div>
          <div className="pipeline-stage">
            <span className="pipeline-stage__label">PLATFORM / 平台层</span>
            <div className="pipeline-stage__card">
              <span className="pipeline-stage__icon" style={{ color: '#a78bfa' }}><FlaskConical size={17} /></span>
              <div>
                <strong>时空数据底座</strong>
                <span>流计算 · 时空索引 · 规则引擎</span>
              </div>
              <em className="mono">4 RULES</em>
            </div>
          </div>
          <div className="pipeline-flow">
            <span>子图召回</span>
            <div><i /></div>
            <em className="mono">↓ KG + LLM</em>
          </div>
          <div className="pipeline-stage">
            <span className="pipeline-stage__label">INTELLIGENCE / 智能层</span>
            <div className="pipeline-stage__card pipeline-stage__card--ai">
              <span className="pipeline-stage__icon" style={{ color: '#ffbc5c' }}><Sparkles size={17} /></span>
              <div>
                <strong>图谱 + 物联大模型</strong>
                <span>风险研判 · 任务生成 · 证据链</span>
              </div>
              <em className="mono">ONLINE</em>
            </div>
          </div>
        </div>
      </Panel>

      <section className="sim-grid">
        <div className="sim-main">
          <Panel
            overline={`MULTI-STATION TELEMETRY · ${GROUP_META[chartGroup].label.toUpperCase()} (${GROUP_META[chartGroup].unit})`}
            title={`${liveMode ? '实时读数 · 单点' : '多站实时遥测'} · ${GROUP_META[chartGroup].label}`}
            icon={Waves}
            extra={
              <Segmented
                size="sm"
                value={chartGroup}
                onChange={(value) => updateQuery({ chart: value })}
                options={[
                  { label: '水质', value: 'water' },
                  { label: '气象', value: 'weather' },
                  { label: '空气', value: 'air' },
                  { label: '地灾', value: 'geology' },
                ]}
              />
            }
          >
            <EChart key={chartGroup} option={chartOption} height={252} replaceSeries />
          </Panel>

          <Panel
            overline="DEVICE OBSERVATION MATRIX"
            title="设备观测矩阵"
            icon={Gauge}
            className="device-table-panel"
            extra={
              <div className="table-tools">
                <div className="filter-tabs">
                  {(
                    [
                      { key: 'all', label: '全部' },
                      { key: 'online', label: '在线' },
                      { key: 'warning', label: '预警' },
                      { key: 'offline', label: '离线' },
                    ] as { key: typeof filter; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={filter === item.key ? 'is-active' : ''}
                      aria-pressed={filter === item.key}
                      onClick={() => updateQuery({ status: item.key === 'all' ? null : item.key })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="search-box">
                  <Search size={13} />
                  <input
                    value={search}
                    onChange={(event) => updateQuery({ search: event.target.value })}
                    placeholder="搜索设备 / 区域"
                    aria-label="搜索设备"
                  />
                </label>
              </div>
            }
          >
            <div className="device-table-scroll">
            <div className="device-table">
              <div className="device-table__head">
                <span>设备 / 编号</span>
                <span>类型</span>
                <span>空间区域</span>
                <span>核心观测</span>
                <span>电量 / 信号</span>
                <span>状态</span>
              </div>
              <div className="device-table__body">
                {filteredDevices.map((device) => {
                  const primary = primaryMetric(device.id);
                  const reading = readings[device.id] ?? {};
                  return (
                    <button
                      key={device.id}
                      type="button"
                      className={`device-table__row ${selectedId === device.id ? 'is-selected' : ''}`}
                      aria-pressed={selectedId === device.id}
                      onClick={() => updateQuery({ focus: device.id })}
                    >
                      <span className="device-table__name">
                        <i style={{ color: KIND_META[device.kind].color }}>
                          <DeviceIcon kind={device.kind} size={15} />
                        </i>
                        <span>
                          <strong>{device.shortName}</strong>
                          <em className="mono">{device.id}</em>
                        </span>
                      </span>
                      <span className="device-table__kind">{KIND_META[device.kind].label}</span>
                      <span className="device-table__zone"><MapPin size={11} />{device.zone}</span>
                      <span className="device-table__metric">
                        <em>{primary.label}</em>
                        <strong className="mono">{primary.value}</strong>
                      </span>
                      <span className="device-table__battery">
                        <span className="battery">
                          <i style={{ width: `${readings[device.id] ? reading.battery ?? (liveMode ? 0 : device.battery) : 0}%` }} />
                        </span>
                        <em className="mono">{reading.battery !== undefined ? `${reading.battery}%` : readings[device.id] && !liveMode ? `${device.battery}%` : '--'}</em>
                        <span className="signal mono"><i style={{ height: `${liveMode && reading.signal === undefined ? 0 : Math.max(18, reading.signal ?? device.signal)}%` }} />{liveMode ? reading.signal ?? '--' : device.signal}</span>
                      </span>
                      <span><StatusText status={deviceStatuses[device.id]} /></span>
                    </button>
                  );
                })}
                {!filteredDevices.length && <div className="table-empty" role="status">没有符合条件的设备<button type="button" className="btn btn--sm" onClick={() => updateQuery({ status: null, search: null })}>清除筛选</button></div>}
              </div>
            </div>
            </div>
          </Panel>
        </div>

        <aside className="sim-side">
          <Panel
            overline="DEVICE INSPECTOR"
            title="设备观测详情"
            icon={Gauge}
            extra={<StatusText status={selectedStatus} />}
            className="inspector"
          >
            <div className="inspector-body" key={selectedDevice.id}>
            <div className="inspector-head">
              <span className="inspector-head__icon" style={{ color: KIND_META[selectedDevice.kind].color }}>
                <DeviceIcon kind={selectedDevice.kind} size={24} />
              </span>
              <div>
                <h4>{selectedDevice.name}</h4>
                <span>{selectedDevice.id} · {selectedDevice.zone}</span>
              </div>
            </div>

            <div className={`inspector-hero inspector-hero--${heroMissing ? 'missing' : heroState}`}>
              <div>
                <span>{heroDef?.label ?? '设备电量'}</span>
                <strong className="mono">
                  {heroMissing ? '--' : heroDef ? heroValue.toFixed(heroDef.digits) : heroValue}
                  <em>{heroMissing ? '' : heroDef?.unit ?? '%'}</em>
                </strong>
                <p>
                  {heroMissing ? '暂无实时读数' : heroState === 'normal' ? '处于正常运行区间' : heroState === 'warning' ? '接近或超过预警阈值' : '已超过严重阈值'}
                </p>
              </div>
              {!heroMissing && !liveMode && <Sparkline
                data={seriesFor(heroValue, tick, 2.4, heroDef ? (heroDef.crit - heroDef.warn) / 4 || 1 : 4, heroDef?.digits ?? 0)}
                color={heroState === 'normal' ? '#23e6b0' : heroState === 'warning' ? '#ffbc5c' : '#ff5d6c'}
                height={54}
              />}
            </div>

            {selectedMetricDefs.length > 0 ? (
              <div className="metric-list">
                {selectedMetricDefs.map((def) => {
                  const missing = selectedReading[def.key] === undefined;
                  const value = Number(selectedReading[def.key] ?? 0);
                  const state = missing ? 'normal' : metricState(def, value);
                  const span = def.direction === 'low' ? def.warn * 1.8 || 1 : def.direction === 'range' ? def.crit - (def.low ?? 0) : def.crit * 1.15 || 1;
                  const ratio = def.direction === 'low' ? 1 - Math.min(1, value / (def.warn * 2 || 1)) : def.direction === 'range' ? Math.min(1, Math.max(0, (value - (def.low ?? 0)) / (def.crit - (def.low ?? 0)))) : Math.min(1, value / (def.crit * 1.15 || 1));
                  return (
                    <div className="metric-row" key={def.key}>
                      <div className="metric-row__head">
                        <span>{def.label}</span>
                        <strong className={`mono metric--${missing ? 'missing' : state}`}>{missing ? '--' : value.toFixed(def.digits)}<em>{missing ? '' : def.unit}</em></strong>
                      </div>
                      <div className="metric-bar">
                        <span
                          style={{
                            width: `${missing ? 0 : Math.max(4, ratio * 100)}%`,
                            background: state === 'normal' ? '#23e6b0' : state === 'warning' ? '#ffbc5c' : '#ff5d6c',
                          }}
                        />
                        <i style={{ left: `${def.direction === 'range' ? 70 : 82}%` }} />
                      </div>
                      <div className="metric-row__foot">
                        <span>阈值 {def.direction === 'low' ? '≤' : '≥'} {def.warn}{def.unit}</span>
                        <span>{def.direction === 'low' ? '低阈' : '高阈'} {def.crit}{def.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="inspector-facts">
                {[
                  { label: '接入协议', value: selectedDevice.protocol },
                  { label: '设备型号', value: selectedDevice.model },
                  { label: '任务进度', value: liveMode && selectedReading.progress === undefined ? '--' : `${Math.round(selectedReading.progress ?? 64)}%` },
                  { label: '在线时长', value: liveMode ? '--' : selectedDevice.onlineSince ?? '持续值守' },
                ].map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}

            {!liveMode && selectedDevice.note && <div className="inspector-note">{selectedDevice.note}</div>}

            <div className="inspector-meta">
              <div><span>接入协议</span><strong>{selectedDevice.protocol}</strong></div>
              <div><span>电量</span><strong className="mono">{selectedReading.battery !== undefined ? `${selectedReading.battery}%` : readings[selectedDevice.id] && !liveMode ? `${selectedDevice.battery}%` : '--'}</strong></div>
              <div><span>信号</span><strong className="mono">{liveMode ? selectedReading.signal === undefined ? '--' : `${selectedReading.signal}%` : `${selectedDevice.signal}%`}</strong></div>
              <div><span>坐标</span><strong className="mono">{selectedDevice.lng.toFixed(4)}, {selectedDevice.lat.toFixed(4)}</strong></div>
            </div>

            <div className="inspector-actions">
              <Link to={`/map?focus=${selectedDevice.id}`} className="btn btn--sm">
                <MapPin size={13} /> 地图定位
              </Link>
              <Link to={`/copilot?q=${encodeURIComponent(`${selectedDevice.shortName}当前状态如何？`)}`} className="btn btn--sm btn--ai">
                <Sparkles size={13} /> 询问大模型
              </Link>
            </div>
            </div>
          </Panel>

          <Panel
            overline="SIMULATION EVENT LOG"
            title="仿真事件流"
            icon={Activity}
            className="sim-events"
            extra={<span className="mono detail-text">{events.length} RECORDS</span>}
          >
            <div className="event-list event-list--scroll">
              {events.map((event) => (
                <div className="event-row" key={event.id}>
                  <EventIcon type={event.type} />
                  <div>
                    <span>{event.text}</span>
                    <em className="mono">{event.time}</em>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}
