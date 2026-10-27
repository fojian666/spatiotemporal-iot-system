import { useInvestigation } from '../investigation/InvestigationProvider';
import { useScenarioRequest } from '../hooks/useScenarioRequest';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Bot,
  ChevronRight,
  CircleAlert,
  Cpu,
  HeartPulse,
  Maximize2,
  MapPin,
  MessageSquareText,
  RadioTower,
  Radar,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { graphic, type EChartsOption } from '../lib/echarts';
import { PageHeader } from '../components/Shell';
import { AnimatedMetric } from '../components/ui';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { MapView } from '../components/MapView';
import { EChart } from '../components/charts';
import {
  DeviceIcon,
  Donut,
  EventIcon,
  LevelPill,
  Panel,
  ProgressBar,
  Segmented,
  Sparkline,
  StatusPill,
  StatusText,
} from '../components/ui';
import { DEVICES, KIND_META, PROTOCOL_STATS, ZONES } from '../data/devices';
import { SCENARIO_LIST } from '../data/scenarios';
import { formatSimTime, useSimulation } from '../engine/simulation';
import { chartPalette, useTheme } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { usePageQuery } from '../hooks/usePageQuery';
import { usePageScroll } from '../hooks/usePageScroll';

type ChartTab = 'weather' | 'water' | 'air';

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
  footer,
  spark,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  unit?: string;
  color: string;
  footer: ReactNode;
  spark?: number[];
}) {
  const animated = useAnimatedNumber(typeof value === 'number' ? value : 0);
  const shownValue = typeof value === 'number'
    ? (Number.isInteger(value) ? Math.round(animated) : animated.toFixed(1))
    : value;

  return (
    <article className="kpi" style={{ '--kpi': color } as CSSProperties}>
      <div className="kpi__top">
        <span className="kpi__label">
          <span className="kpi__icon"><Icon size={13} /></span>
          {label}
        </span>
        <span className="kpi__corner" />
      </div>
      <div className="kpi__main">
        <strong className="mono">{shownValue}</strong>
        {unit && <span className="kpi__unit">{unit}</span>}
      </div>
      <div className="kpi__foot">
        <div className="kpi__footcopy">{footer}</div>
        {spark && <Sparkline data={spark} color={color} height={26} />}
      </div>
    </article>
  );
}

export function OverviewPage() {
  const {
    stats,
    alerts,
    events,
    history,
    scenario,
    scenarioKey,
    readings,
    deviceStatuses,
    cycleAlert,
    simTime,
  } = useSimulation();
  const { canOperate } = useAuth();
  const scenarioRequest = useScenarioRequest();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingAlert, setPendingAlert] = useState<string | null>(null);
  const [alertFeedback, setAlertFeedback] = useState<{ id: string; serial: number } | null>(null);
  const [alertError, setAlertError] = useState('');
  async function acknowledgeAlert(id: string) {
    setPendingAlert(id);
    setAlertError('');
    const ok = await cycleAlert(id);
    setPendingAlert(null);
    if (ok) setAlertFeedback((previous) => ({ id, serial: (previous?.serial ?? 0) + 1 }));
    else setAlertError('状态更新失败，请重试。');
  }
  const [feedTab, setFeedTab] = useState<'alerts' | 'events'>('alerts');
  useEffect(() => {
    if (!alertFeedback) return;
    const timer = window.setTimeout(() => setAlertFeedback(null), 620);
    return () => window.clearTimeout(timer);
  }, [alertFeedback]);
  const [params, updateQuery] = usePageQuery();
  const pageRef = usePageScroll();
  const expandedAlert = params.get('alert');
  const { begin } = useInvestigation();
  const [chartTab, setChartTab] = useState<ChartTab>('weather');
  const navigate = useNavigate();
  const theme = useTheme();
  const palette = useMemo(() => chartPalette(), [theme]);
  const time = formatSimTime(simTime);

  const selectedDevice = DEVICES.find((device) => device.id === selectedId) ?? null;
  const selectedReading = selectedId ? readings[selectedId] ?? {} : {};

  const healthSeries = useMemo(
    () => history.map((point, index) => Math.max(24, 99 - point.pm25 * 0.11 - point.turbidity * 0.07 - (scenarioKey === 'normal' ? 0 : 8) + Math.sin(index / 3) * 1.5)),
    [history, scenarioKey],
  );
  const messageSeries = useMemo(() => history.map((_, index) => 1250 + Math.sin(index / 4) * 42 + (scenarioKey === 'normal' ? 0 : 300)), [history, scenarioKey]);

  const chartOption = useMemo<EChartsOption>(() => {
    const labels = history.map((point) => point.t);
    const common = {
      backgroundColor: 'transparent',
      animationDuration: 650,
      animationEasing: 'cubicOut' as const,
      animationDurationUpdate: 650,
      animationEasingUpdate: 'cubicOut' as const,
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: palette.tipBg,
        borderColor: palette.tipBorder,
        textStyle: { color: palette.tipText, fontSize: 11 },
        confine: true,
        axisPointer: { type: 'line' as const, lineStyle: { color: 'rgba(75,225,255,.3)' } },
      },
      grid: { top: 26, left: 36, right: 34, bottom: 22 },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: palette.axisLine } },
        axisTick: { show: false },
        axisLabel: { color: palette.dim, fontSize: 9, interval: 9, fontFamily: 'SF Mono, monospace' },
      },
      legend: {
        top: 0,
        right: 4,
        icon: 'roundRect',
        itemWidth: 9,
        itemHeight: 3,
        itemGap: 12,
        textStyle: { color: palette.label, fontSize: 10 },
      },
    };

    if (chartTab === 'weather') {
      return {
        ...common,
        yAxis: [
          { type: 'value', name: '°C', nameTextStyle: { color: palette.dim, fontSize: 9 }, axisLabel: { color: palette.dim, fontSize: 9 }, splitLine: { lineStyle: { color: palette.grid } } },
          { type: 'value', name: '%', nameLocation: 'middle', nameRotate: -90, nameGap: 14, nameTextStyle: { color: palette.dim, fontSize: 9 }, axisLabel: { color: palette.dim, fontSize: 9 }, splitLine: { show: false } },
        ],
        series: [
          {
            name: '气温',
            type: 'line',
            smooth: true,
            symbol: 'none',
            data: history.map((point) => point.temperature),
            lineStyle: { width: 1.7, color: '#4be1ff' },
            areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(75,225,255,.2)' }, { offset: 1, color: 'rgba(75,225,255,0)' }]) },
          },
          {
            name: '湿度',
            type: 'line',
            smooth: true,
            symbol: 'none',
            yAxisIndex: 1,
            data: history.map((point) => point.humidity),
            lineStyle: { width: 1.4, color: '#23e6b0', type: 'dashed' },
          },
        ],
      };
    }
    if (chartTab === 'water') {
      return {
        ...common,
        yAxis: [
          { type: 'value', name: 'm', nameTextStyle: { color: palette.dim, fontSize: 9 }, axisLabel: { color: palette.dim, fontSize: 9 }, splitLine: { lineStyle: { color: palette.grid } } },
          { type: 'value', name: 'NTU', nameLocation: 'middle', nameRotate: -90, nameGap: 14, nameTextStyle: { color: palette.dim, fontSize: 9 }, axisLabel: { color: palette.dim, fontSize: 9 }, splitLine: { show: false } },
        ],
        series: [
          {
            name: '平均水位',
            type: 'line',
            smooth: true,
            symbol: 'none',
            data: history.map((point) => point.waterLevel),
            lineStyle: { width: 1.7, color: '#7aa2ff' },
            areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(122,162,255,.22)' }, { offset: 1, color: 'rgba(122,162,255,0)' }]) },
          },
          {
            name: '浊度',
            type: 'line',
            smooth: true,
            symbol: 'none',
            yAxisIndex: 1,
            data: history.map((point) => point.turbidity),
            lineStyle: { width: 1.4, color: '#ffbc5c', type: 'dashed' },
          },
        ],
      };
    }
    return {
      ...common,
      yAxis: [
        { type: 'value', name: 'µg/m³', nameTextStyle: { color: palette.dim, fontSize: 9 }, axisLabel: { color: palette.dim, fontSize: 9 }, splitLine: { lineStyle: { color: palette.grid } } },
      ],
      series: [
        {
          name: 'PM2.5',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: history.map((point) => point.pm25),
          lineStyle: { width: 1.7, color: '#ff8b6b' },
          areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(255,139,107,.24)' }, { offset: 1, color: 'rgba(255,139,107,0)' }]) },
        },
      ],
    };
  }, [chartTab, history, palette]);

  const zoneIssues = (zone: string) =>
    DEVICES.filter((device) => device.zone === zone && deviceStatuses[device.id] !== 'online').length;

  const selectedMetrics = useMemo(() => {
    if (!selectedDevice) return [];
    if (selectedDevice.metrics.length) {
      return selectedDevice.metrics.slice(0, 3).map((def) => ({
        label: def.label,
        value: `${Number(selectedReading[def.key] ?? 0).toFixed(def.digits)}${def.unit}`,
      }));
    }
    return [
      { label: '电量', value: `${selectedReading.battery ?? selectedDevice.battery}%` },
      { label: '信号', value: `${selectedDevice.signal}%` },
      { label: '任务', value: `${Math.round(selectedReading.progress ?? 64)}%` },
    ];
  }, [selectedDevice, selectedReading]);

  return (
    <div ref={pageRef} className="page overview-page">
      {scenarioRequest.error && <p role="alert" className="interaction-error">{scenarioRequest.error}</p>}
      <PageHeader
        icon={Radar}
        overline={`SPATIOTEMPORAL INTELLIGENT IOT · ${time.date.replaceAll('-', '.')}`}
        title="一图感知平安"
        description="空天地立体感知 · 时空语义推理 · 人机协同决策"
        actions={
          <>
            <div className="scenario-switch">
              <span className="scenario-switch__label">场景推演</span>
              {SCENARIO_LIST.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`scenario-switch__item ${scenarioKey === item.key ? 'is-active' : ''}`}
                  aria-pressed={scenarioKey === item.key}
                  style={{ '--sc': item.color } as CSSProperties}
                  onClick={() => void scenarioRequest.request(item.key)}
                  disabled={!canOperate || scenarioRequest.pending}
                  title={canOperate ? undefined : '观察员为只读角色'}
                >
                  <i />
                  {item.name}
                </button>
              ))}
            </div>
            <Link className="btn btn--primary" to="/copilot">
              <Sparkles size={14} />
              物联大模型
            </Link>
          </>
        }
      />

      <section className="kpi-grid">
        <KpiCard
          icon={RadioTower}
          label="接入感知节点"
          value={stats.total}
          unit="个"
          color="#4be1ff"
          footer={
            <span className="kpi-statusline">
              <em className="dot dot--online" /> {stats.online - stats.warning} 正常
              <em className="dot dot--warn" /> {stats.warning} 预警
              <em className="dot dot--off" /> {stats.offline} 离线
            </span>
          }
          spark={messageSeries.map((_, index) => 18 + Math.sin(index / 3) + (index > 30 ? 1.2 : 0))}
        />
        <KpiCard
          icon={HeartPulse}
          label="区域健康度"
          value={Math.round(stats.regionHealth)}
          unit="/100"
          color="#23e6b0"
          footer={
            <>
              <ProgressBar value={stats.regionHealth} color="#23e6b0" height={4} />
              <span className="kpi-mini">在线率 {stats.onlineRate.toFixed(1)}%</span>
            </>
          }
          spark={healthSeries}
        />
        <KpiCard
          icon={ShieldAlert}
          label="活动告警"
          value={stats.activeAlerts}
          unit="条"
          color="#ffbc5c"
          footer={
            <span className="kpi-alertline">
              {alerts.filter((alert) => alert.level === 'critical' && alert.status !== '已完成').length} 严重
              <span>·</span>
              {alerts.filter((alert) => alert.level === 'warning' && alert.status !== '已完成').length} 警告
              <span>·</span>
              {alerts.filter((alert) => alert.level === 'info' && alert.status !== '已完成').length} 提示
            </span>
          }
          spark={[1, 1, 2, 1, 2, 2, 3, 2, 2, 3, 2, 2, 3, 2, 2, 1, 2, 2]}
        />
        <KpiCard
          icon={Bot}
          label="全无人系统"
          value={stats.unmannedActive}
          unit="套"
          color="#a78bfa"
          footer={<span className="kpi-mini">无人机 ×2 · 无人车 · 无人船 · 卫星</span>}
          spark={[2, 3, 3, 4, 4, 5, 5, 5, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5]}
        />
        <KpiCard
          icon={Activity}
          label="实时消息速率"
          value={stats.messageRate.toLocaleString()}
          unit="msg/s"
          color="#7aa2ff"
          footer={
            <span className="kpi-mini">
              数据质量 {stats.dataQuality}% · 端到端 42ms
            </span>
          }
          spark={messageSeries}
        />
      </section>

      <section className="overview-grid">
        <aside className="overview-col overview-col--left">
          <Panel
            overline="COVERAGE"
            title="区域感知覆盖"
            icon={Radar}
            extra={<span className="mono detail-text">{stats.online}/{stats.total} ONLINE</span>}
            className="zone-panel"
          >
            <div className="zone-list">
              {ZONES.map((zone) => (
                <div className="zone-row" key={zone.name}>
                  <div className="zone-row__top">
                    <span className="zone-row__name">
                      <i className={zoneIssues(zone.name) ? 'is-warn' : ''} />
                      {zone.name}
                    </span>
                    <span className="zone-row__meta">
                      <em>{zone.level}</em>
                      <strong className="mono">{zone.devices}</strong>
                    </span>
                  </div>
                  <div className="zone-row__bar">
                    <span style={{ width: `${(zone.devices / 5) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel overline="CONNECTIVITY" title="接入链路构成" icon={Cpu} className="protocol-panel">
            <div className="protocol-summary">
              <Donut value={stats.onlineRate} size={86} color="#4be1ff" label="在线率" />
              <div className="protocol-legend">
                {PROTOCOL_STATS.map((item) => (
                  <div className="protocol-legend__row" key={item.name}>
                    <span><i style={{ background: item.color }} />{item.name}</span>
                    <strong className="mono">{item.value}%</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="protocol-note">
              <Waves size={13} />
              多协议经边缘网关统一为时空消息，写入流式计算与时空索引。
            </div>
          </Panel>
        </aside>

        <section className="overview-col overview-col--center">
          <div className="overview-map panel">
            <div className="overview-map__head">
              <div>
                <span className="overline">LIVE SITUATION · {scenario.code}</span>
                <h2>平安区 · 湟水河流域</h2>
              </div>
              <div className="overview-map__meta">
                <StatusPill tone="online">实时态势</StatusPill>
                <span className="mono">AUTO FIT</span>
                <span className="mono">WGS-84</span>
              </div>
            </div>
            <div className="overview-map__body">
              <MapView
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
                initialZoom={12.3}
                className="overview-map__map"
              />
              <div className="map-summary">
                <div>
                  <span>气温</span>
                  <strong className="mono">{stats.avgTemperature}<em>°C</em></strong>
                </div>
                <div>
                  <span>平均水位</span>
                  <strong className="mono">{stats.avgWaterLevel}<em>m</em></strong>
                </div>
                <div>
                  <span>PM2.5</span>
                  <strong className="mono">{stats.avgPm25}<em>µg/m³</em></strong>
                </div>
              </div>

              {selectedDevice && (
                <div className="map-device-card">
                  <button type="button" className="icon-btn map-device-card__close" onClick={() => setSelectedId(null)} aria-label="关闭">
                    <X size={13} />
                  </button>
                  <div className="map-device-card__head">
                    <span className="map-device-card__icon" style={{ color: KIND_META[selectedDevice.kind].color }}>
                      <DeviceIcon kind={selectedDevice.kind} size={17} />
                    </span>
                    <div>
                      <strong>{selectedDevice.name}</strong>
                      <span>{selectedDevice.id} · {selectedDevice.zone}</span>
                    </div>
                    <StatusText status={deviceStatuses[selectedDevice.id]} />
                  </div>
                  <div className="map-device-card__metrics">
                    {selectedMetrics.map((metric) => (
                      <div key={metric.label}>
                        <span>{metric.label}</span>
                        <strong className="mono">{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="map-device-card__foot">
                    <span className="mono">{selectedDevice.protocol}</span>
                    <button type="button" onClick={() => navigate(`/copilot?q=${encodeURIComponent(`${selectedDevice.shortName}当前状态如何？`)}`)}>
                      问大模型 <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
              )}

              <div className="map-hud-label map-hud-label--tl">
                <span />
                <em>空天地一体感知</em>
              </div>
              <div className="map-hud-label map-hud-label--br">
                <span />
                <em>5 类无人系统在线</em>
              </div>
            </div>
          </div>

          <Panel
            overline="MULTI-SOURCE TREND · LOCAL SYNC · 5S WINDOW"
            title="多源时空趋势"
            icon={Activity}
            className="trend-panel"
            extra={
              <Segmented
                size="sm"
                value={chartTab}
                onChange={(value) => setChartTab(value)}
                options={[
                  { label: '温湿度', value: 'weather' },
                  { label: '水位浊度', value: 'water' },
                  { label: 'PM2.5', value: 'air' },
                ]}
              />
            }
          >
            <EChart key={chartTab} option={chartOption} height={154} />
          </Panel>
        </section>

        <aside className="overview-col overview-col--right">
          <Panel
            overline="LIVE INTELLIGENCE"
            title="告警与动态"
            icon={TriangleAlert}
            className="alert-panel"
            extra={
              <div className="feed-tabs">
                <button type="button" className={feedTab === 'alerts' ? 'is-active' : ''} onClick={() => { setAlertFeedback(null); setFeedTab('alerts'); }}>
                  告警 <em><AnimatedMetric value={stats.activeAlerts} /></em>
                </button>
                <button type="button" className={feedTab === 'events' ? 'is-active' : ''} onClick={() => { setAlertFeedback(null); setFeedTab('events'); }}>
                  动态 <em>{events.length}</em>
                </button>
              </div>
            }
          >
            {feedTab === 'alerts' ? (
              <div className="alert-list">
                {alertError && <p className="interaction-error" role="alert">{alertError}</p>}
                {alerts.map((alert) => (
                  <div key={alert.id} className={`alert-row ${expandedAlert === alert.id ? 'is-open' : ''}`}>
                    {alertFeedback?.id === alert.id && <span key={alertFeedback.serial} className="alert-confirmation" aria-hidden="true" />}
                    <button
                      type="button"
                      className="alert-row__main"
                      aria-expanded={expandedAlert === alert.id}
                      onClick={() => updateQuery({ alert: expandedAlert === alert.id ? null : alert.id })}
                    >
                      <LevelPill level={alert.level} />
                      <div className="alert-row__body">
                        <strong>{alert.title}</strong>
                        <span>{alert.source} · {alert.zone} · {alert.time}</span>
                      </div>
                      <span key={alert.status} className={`alert-status alert-status--${alert.status === '已完成' ? 'done' : alert.status === '处置中' ? 'doing' : 'todo'}`}>
                        {alert.status}
                      </span>
                    </button>
                    <div
                      className={`alert-row__detail-wrap ${expandedAlert === alert.id ? 'is-open' : ''}`}
                      aria-hidden={expandedAlert !== alert.id}
                    >
                      <div className="alert-row__detail">
                        <p>{alert.detail}</p>
                        <div className="alert-row__actions">
                          <Link to={`/map?focus=${alert.source}`} onClick={() => begin(alert, scenarioKey, simTime.getTime(), params.toString())} tabIndex={expandedAlert === alert.id ? 0 : -1}><MapPin size={12} /> 地图定位</Link>
                          <Link to={`/simulation?focus=${alert.source}`} onClick={() => begin(alert, scenarioKey, simTime.getTime(), params.toString())} tabIndex={expandedAlert === alert.id ? 0 : -1}><Activity size={12} /> 查看遥测</Link>
                          <Link to={`/copilot?q=${encodeURIComponent(`${alert.source}当前状态如何？`)}`} onClick={() => begin(alert, scenarioKey, simTime.getTime(), params.toString())} tabIndex={expandedAlert === alert.id ? 0 : -1}><Bot size={12} /> 辅助研判</Link>
                          <button type="button" onClick={() => void acknowledgeAlert(alert.id)} disabled={!canOperate || pendingAlert !== null} tabIndex={expandedAlert === alert.id ? 0 : -1} title={canOperate ? undefined : '观察员为只读角色，可查看地图与遥测'}>
                            <Sparkles size={12} /> {pendingAlert === alert.id ? '提交中…' : alert.status === '待处置' ? '联动处置' : alert.status === '处置中' ? '标记完成' : '重新打开'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <Link className="panel-link" to="/map">
                  进入一张图查看事件位置 <ChevronRight size={13} />
                </Link>
                <div className="alert-mini-feed">
                  <span className="overline">LATEST SIGNALS</span>
                  {events.slice(0, 2).map((event) => (
                    <div key={event.id}>
                      <i className={`signal-dot signal-dot--${event.type}`} />
                      <span>{event.text}</span>
                      <em className="mono">{event.time}</em>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="event-list">
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
            )}
          </Panel>

          <Panel
            overline="AGENT · SPATIOTEMPORAL REASONING"
            title="物联智能体建议"
            icon={Sparkles}
            className="agent-panel"
            extra={<StatusPill tone="ai" dot>在线</StatusPill>}
          >
            <div className="agent-advice">
              <span className="agent-advice__icon"><Sparkles size={15} /></span>
              <p>{scenario.agentAdvice}</p>
            </div>
            <div className="agent-insights">
              <div className="agent-insight">
                <CircleAlert size={14} />
                <div>
                  <span>优先关注</span>
                  <strong>{alerts.find((alert) => alert.level === 'critical')?.title ?? alerts.find((alert) => alert.status === '待处置')?.title ?? '排口浊度趋势'}</strong>
                </div>
              </div>
              <div className="agent-insight">
                <MessageSquareText size={14} />
                <div>
                  <span>时空线索</span>
                  <strong>{scenario.triggers[0]} · 关联 {Math.max(2, stats.activeAlerts + 1)} 个空间对象</strong>
                </div>
              </div>
            </div>
            <div className="agent-tags">
              <span>多源融合</span>
              <span>图谱推理</span>
              <span>人工确认</span>
            </div>
            <Link className="btn btn--ai btn--block" to={`/copilot?q=${encodeURIComponent('分析当前区域风险并给出处置建议')}`}>
              <Bot size={14} /> 向物联大模型追问 <ArrowUpRight size={13} />
            </Link>
          </Panel>
        </aside>
      </section>
    </div>
  );
}
