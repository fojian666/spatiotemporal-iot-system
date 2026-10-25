import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  BatteryCharging,
  CalendarClock,
  Camera,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crosshair,
  Download,
  FolderArchive,
  Gamepad2,
  Gauge,
  Home,
  Images,
  MapPin,
  Navigation,
  Pause,
  Plane,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Route as RouteIcon,
  ScanEye,
  ShieldCheck,
  Trash2,
  Video,
  Wind,
  X,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { PageHeader } from '../components/Shell';
import { MapView } from '../components/MapView';
import { RouteEditorMap } from '../components/RouteEditorMap';
import { DeviceIcon, Panel, StatusPill, StatusText } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { useSimulation } from '../engine/simulation';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { DeviceKind } from '../data/devices';
import {
  createDronePlan,
  deleteDroneRoute,
  fetchDroneOverview,
  REMOTE_ENABLED,
  saveDroneRoute,
  sendDroneCommand,
  updateDroneClue,
  type AiClue,
  type DroneDeviceCard,
  type DroneOverview,
  type DroneRoute,
  type DroneWaypoint,
  type FlightCommand,
  type FlightPlan,
  type MediaAsset,
} from '../services/api';

type TabKey = 'assets' | 'routes' | 'plans' | 'flight' | 'media' | 'clues';

const TABS: { key: TabKey; label: string; en: string; icon: typeof Radar }[] = [
  { key: 'assets', label: '设备机场', en: 'ASSETS', icon: Radar },
  { key: 'routes', label: '航线规划', en: 'ROUTES', icon: RouteIcon },
  { key: 'plans', label: '任务计划', en: 'PLANS', icon: CalendarClock },
  { key: 'flight', label: '实时飞控', en: 'FLIGHT', icon: Gamepad2 },
  { key: 'media', label: '媒体成果', en: 'MEDIA', icon: Images },
  { key: 'clues', label: 'AI 线索', en: 'CLUES', icon: ScanEye },
];

const PLAN_STATUS_CLASS: Record<string, string> = {
  未开始: 'pending',
  执行中: 'running',
  已暂停: 'paused',
  已完成: 'done',
  执行失败: 'failed',
};

const COMMAND_LABELS: Record<string, string> = {
  takeoff: '起飞',
  pause: '暂停',
  resume: '继续',
  hover: '悬停',
  return: '返航',
  land: '降落',
  complete: '完成',
  fail: '异常',
};

const CAMERA_FOR_AIRPORT: Record<string, string> = { 'UAV-01': 'CAM-01', 'UAV-02': 'CAM-03' };

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatClock(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function distanceKm(points: DroneWaypoint[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
    const dLat = (b.lat - a.lat) * 111.32;
    const dLng = (b.lng - a.lng) * 111.32 * Math.cos(lat);
    total += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  return total;
}

function useStatusPulse(status: string): string {
  const [pulsing, setPulsing] = useState(false);
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return undefined;
    previous.current = status;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 420);
    return () => window.clearTimeout(timer);
  }, [status]);
  return pulsing ? 'is-pulsing' : '';
}

function AnimatedCount({ value }: { value: number }) {
  const shown = useAnimatedNumber(value);
  return <>{Math.round(shown)}</>;
}

function PlanStatus({ status }: { status: string }) {
  const pulse = useStatusPulse(status);
  return <span className={`plan-status plan-status--${PLAN_STATUS_CLASS[status] ?? 'pending'} ${pulse}`}><i />{status}</span>;
}

function ClueStatus({ status }: { status: AiClue['status'] }) {
  const pulse = useStatusPulse(status);
  const tone = status === '待处理' ? 'pending' : status === '已核实' ? 'done' : 'ignored';
  return <span className={`clue-status clue-status--${tone} ${pulse}`}><i />{status}</span>;
}

function OpsModal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(cardRef);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 180);
  }, [closing, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  return (
    <div className={`ops-modal ${closing ? 'is-closing' : ''}`} role="presentation" onClick={requestClose}>
      <div
        ref={cardRef}
        className={`ops-modal__card ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ops-modal__head">
          <div>
            <span className="overline">{subtitle ?? 'DRONE OPERATIONS'}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="关闭"><X size={15} /></button>
        </header>
        <div className="ops-modal__body">{children}</div>
      </div>
    </div>
  );
}

export function DroneOpsPage() {
  const { canOperate } = useAuth();
  const { readings, deviceStatuses } = useSimulation();
  const [data, setData] = useState<DroneOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabKey>('assets');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastLeaving, setToastLeaving] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const toastLeaveTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    setToastLeaving(false);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    if (toastLeaveTimer.current) window.clearTimeout(toastLeaveTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setToast('');
        setToastLeaving(false);
        return;
      }
      setToastLeaving(true);
      toastLeaveTimer.current = window.setTimeout(() => {
        setToast('');
        setToastLeaving(false);
        toastLeaveTimer.current = null;
      }, 180);
    }, 3400);
  }, []);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const overview = await fetchDroneOverview();
      setData(overview);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '无法加载一网统飞数据';
      setError(message);
      if (background) notify(`刷新失败：${message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!REMOTE_ENABLED) {
      setLoading(false);
      return undefined;
    }
    void load();
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (toastLeaveTimer.current) window.clearTimeout(toastLeaveTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!data || activePlanId) return;
    const candidate = data.plans.find((plan) => plan.status === '执行中') ?? data.plans[0];
    setActivePlanId(candidate?.id ?? null);
  }, [data, activePlanId]);

  const activePlan = data?.plans.find((plan) => plan.id === activePlanId) ?? null;

  const replacePlan = useCallback((plan: FlightPlan, command?: FlightCommand) => {
    setData((current) => {
      if (!current) return current;
      const plans = current.plans.map((item) => (item.id === plan.id ? plan : item));
      return {
        ...current,
        plans,
        counts: {
          ...current.counts,
          activePlans: plans.filter((item) => item.status === '执行中' || item.status === '已暂停').length,
          completedPlans: plans.filter((item) => item.status === '已完成').length,
        },
        commands: command ? [command, ...current.commands].slice(0, 30) : current.commands,
      };
    });
  }, []);

  const addPlan = useCallback((plan: FlightPlan) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        plans: [plan, ...current.plans],
        counts: { ...current.counts, plans: current.counts.plans + 1 },
      };
    });
    setActivePlanId(plan.id);
  }, []);

  const saveRouteResult = useCallback((route: DroneRoute, isNew: boolean) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        routes: isNew ? [route, ...current.routes] : current.routes.map((item) => (item.id === route.id ? route : item)),
        counts: { ...current.counts, routes: isNew ? current.counts.routes + 1 : current.counts.routes },
      };
    });
  }, []);

  const removeRoute = useCallback((routeId: string) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        routes: current.routes.filter((item) => item.id !== routeId),
        counts: { ...current.counts, routes: Math.max(0, current.counts.routes - 1) },
      };
    });
  }, []);

  const replaceClue = useCallback((clue: AiClue) => {
    setData((current) => {
      if (!current) return current;
      const clues = current.clues.map((item) => (item.id === clue.id ? clue : item));
      return {
        ...current,
        clues,
        counts: { ...current.counts, pendingClues: clues.filter((item) => item.status === '待处理').length },
      };
    });
  }, []);

  const handleExecute = useCallback((plan: FlightPlan) => {
    setActivePlanId(plan.id);
    setTab('flight');
  }, []);

  const handleOpenFlightForDevice = useCallback(
    (deviceId: string) => {
      if (!data) return;
      const plan =
        data.plans.find((item) => item.deviceId === deviceId && item.status !== '已完成' && item.status !== '执行失败') ??
        data.plans.find((item) => item.deviceId === deviceId) ??
        data.plans[0];
      if (plan) setActivePlanId(plan.id);
      setTab('flight');
    },
    [data],
  );

  const handleClueUpdate = useCallback(
    async (clueId: string, status: AiClue['status']): Promise<boolean> => {
      try {
        const updated = await updateDroneClue(clueId, status);
        replaceClue(updated);
        notify(`线索已标记为「${status}」`);
        return true;
      } catch (reason) {
        notify(reason instanceof Error ? reason.message : '线索更新失败');
        return false;
      }
    },
    [notify, replaceClue],
  );

  const counts = data?.counts;
  const headerStats = [
    { label: '机场', value: counts?.airports ?? '—', tone: 'cyan' },
    { label: '无人系统', value: (counts ? counts.airports + counts.nonAirport : '—'), tone: 'violet' },
    { label: '执行中', value: counts?.activePlans ?? '—', tone: 'amber' },
    { label: '飞行计划', value: counts?.plans ?? '—', tone: 'teal' },
    { label: '媒体资产', value: counts?.media ?? '—', tone: 'pink' },
    { label: '待处理线索', value: counts?.pendingClues ?? '—', tone: 'rose' },
  ];

  return (
    <div className="page drone-page">
      <PageHeader
        icon={Plane}
        overline="DRONE OPS · ONE-NETWORK FLIGHT PLATFORM"
        title="无人机一网统飞"
        description="机场与无人系统、航线编排、计划调度、实时飞控、媒体成果与 AI 线索的统一作业工作区"
        actions={
          <div className="ops-head-actions">
            <span className="ops-secure"><ShieldCheck size={12} /> JWT · RBAC · MQTT</span>
            <button type="button" className="btn btn--sm" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} />
              {refreshing ? '同步中' : '刷新'}
            </button>
          </div>
        }
      />

      <div className="ops-summary">
        <div className="ops-summary__label">
          <span className="overline">FLIGHT STATISTICS</span>
          <strong>飞行统计</strong>
          <span>实时数据 · {data ? formatClock(data.serverTime) : '同步中'}</span>
        </div>
        {headerStats.map((item) => (
          <div className={`ops-summary__item ops-summary__item--${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong className="mono">{typeof item.value === 'number' ? <AnimatedCount value={item.value} /> : item.value}</strong>
          </div>
        ))}
        <div className="ops-summary__link">
          <span className="mono">{data?.mqtt.connected ? 'MQTT / TLS ONLINE' : 'MQTT RECONNECT'}</span>
          <Link to="/map">打开一张图 <ChevronRight size={12} /></Link>
        </div>
      </div>

      <div className="ops-tabs">
        {TABS.map((item) => {
          const Icon = item.icon;
          const badge =
            item.key === 'plans' ? data?.counts.activePlans :
              item.key === 'media' ? data?.counts.media :
                item.key === 'clues' ? data?.counts.pendingClues : undefined;
          return (
            <button
              key={item.key}
              type="button"
              className={`ops-tab ${tab === item.key ? 'is-active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              <Icon size={14} />
              <span>{item.label}</span>
              <em className="mono">{item.en}</em>
              {badge !== undefined && badge > 0 && <b>{badge}</b>}
            </button>
          );
        })}
        <div className="ops-tabs__spacer" />
        <div className="ops-flow mono">
          设备 <ChevronRight size={10} /> 航线 <ChevronRight size={10} /> 计划 <ChevronRight size={10} /> 飞控 <ChevronRight size={10} /> 媒体 <ChevronRight size={10} /> 线索
        </div>
      </div>

      {!REMOTE_ENABLED && (
        <div className="ops-loading">
          <Plane size={22} />
          <strong>一网统飞需要完整后端服务</strong>
          <p>
            当前为浏览器本地演示模式（VITE_DATA_SOURCE=local）。航线、计划、实时飞控与 AI 线索依赖
            FastAPI + PostGIS + MQTT 实时链路；启动 backend/run.sh 并把 .env.local 设置为
            <span className="mono"> VITE_DATA_SOURCE=api</span> 后刷新即可接入。
          </p>
        </div>
      )}

      {REMOTE_ENABLED && loading && !data && (
        <div className="ops-loading">
          <span className="is-spinning"><RefreshCw size={20} /></span>
          <strong>正在装载无人机作业数据</strong>
          <em className="mono">LOADING ASSETS · ROUTES · PLANS · MEDIA · CLUES</em>
        </div>
      )}

      {REMOTE_ENABLED && error && !data && (
        <div className="ops-loading ops-loading--error">
          <CircleAlert size={22} />
          <strong>一网统飞数据加载失败</strong>
          <p>{error}</p>
          <button type="button" className="btn btn--sm" onClick={() => void load()}>重新加载</button>
        </div>
      )}

      {data && (
        <div className="ops-content" key={tab}>
          {tab === 'assets' && (
            <AssetsView
              data={data}
              readings={readings}
              statuses={deviceStatuses}
              canOperate={canOperate}
              onOpenFlight={handleOpenFlightForDevice}
              onOpenRoutes={() => setTab('routes')}
            />
          )}
          {tab === 'plans' && (
            <PlansView
              data={data}
              canOperate={canOperate}
              onExecute={handleExecute}
              onCreated={(plan) => {
                addPlan(plan);
                notify(`飞行计划「${plan.name}」已创建`);
              }}
            />
          )}
          {tab === 'routes' && (
            <RoutesView
              data={data}
              canOperate={canOperate}
              notify={notify}
              onSaved={(route, isNew) => {
                saveRouteResult(route, isNew);
                notify(`航线「${route.name}」已保存`);
              }}
              onDeleted={removeRoute}
            />
          )}
          {tab === 'flight' && (
            <FlightView
              data={data}
              activePlan={activePlan}
              canOperate={canOperate}
              onSelectPlan={setActivePlanId}
              onPlanUpdated={replacePlan}
              notify={notify}
            />
          )}
          {tab === 'media' && <MediaView data={data} />}
          {tab === 'clues' && (
            <CluesView
              data={data}
              canOperate={canOperate}
              onUpdate={handleClueUpdate}
            />
          )}
        </div>
      )}

      {toast && <div key={toast} className={`ops-toast ${toastLeaving ? 'is-leaving' : ''}`}><Activity size={13} />{toast}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

function AssetsView({
  data,
  readings,
  statuses,
  canOperate,
  onOpenFlight,
  onOpenRoutes,
}: {
  data: DroneOverview;
  readings: Record<string, Record<string, number>>;
  statuses: Record<string, string>;
  canOperate: boolean;
  onOpenFlight: (deviceId: string) => void;
  onOpenRoutes: () => void;
}) {
  const groups = [
    { key: 'airports' as const, label: '机场', icon: Radar, items: data.fleet.airports },
    { key: 'nonAirport' as const, label: '非机场', icon: Plane, items: data.fleet.nonAirport },
    { key: 'ground' as const, label: '地面监控', icon: Camera, items: data.fleet.ground },
  ];
  const [group, setGroup] = useState<'airports' | 'nonAirport' | 'ground'>('airports');
  const [selectedId, setSelectedId] = useState<string | null>(data.fleet.airports[0]?.id ?? data.fleet.ground[0]?.id ?? null);
  const currentGroup = groups.find((item) => item.key === group) ?? groups[0];
  const selected = currentGroup.items.find((item) => item.id === selectedId) ?? currentGroup.items[0] ?? null;

  useEffect(() => {
    if (!currentGroup.items.some((item) => item.id === selectedId)) {
      setSelectedId(currentGroup.items[0]?.id ?? null);
    }
  }, [currentGroup, selectedId]);

  const focusDevice = (id: string | null) => {
    if (!id) return;
    const owner = groups.find((item) => item.items.some((device) => device.id === id));
    if (owner) setGroup(owner.key);
    setSelectedId(id);
  };

  return (
    <div className="ops-assets">
      <div className="ops-subbar">
        <div className="ops-subtabs">
          {groups.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={group === item.key ? 'is-active' : ''}
                onClick={() => setGroup(item.key)}
              >
                <Icon size={12} /> {item.label} <b>{item.items.length}</b>
              </button>
            );
          })}
        </div>
        <div className="ops-subbar__right">
          <span className="mono">LIVE INVENTORY · {currentGroup.items.length} NODES</span>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenRoutes}>配置航线 <ChevronRight size={11} /></button>
        </div>
      </div>

      <div className="ops-assets__layout">
        <div className="ops-assets__main">
        <div className={`ops-asset-list ${group === 'airports' ? 'is-grid' : ''}`}>
          {group === 'airports' ? (
            data.fleet.airports.map((device) => {
              const liveStatus = statuses[device.id] ?? device.status;
              const liveBattery = readings[device.id]?.battery ?? device.battery;
              return (
                <button
                  type="button"
                  key={device.id}
                  className={`airport-card ${selected?.id === device.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(device.id)}
                >
                  <div className="airport-card__top">
                    <span className="airport-card__icon"><Plane size={17} /></span>
                    <span className="airport-card__name"><strong>{device.shortName}</strong><em>{device.zone}</em></span>
                    <StatusText status={liveStatus as never} />
                  </div>
                  <div className="airport-card__grid">
                    <span><em>机型</em><strong>{device.model}</strong></span>
                    <span><em>相机</em><strong>{CAMERA_FOR_AIRPORT[device.id] ?? 'CAM-02'}</strong></span>
                    <span><em>电量</em><strong className="mono">{liveBattery}%</strong></span>
                    <span><em>信号</em><strong className="mono">{device.signal}%</strong></span>
                  </div>
                  <div className="airport-card__foot">
                    <span className="mono">{device.id}</span>
                    <span>进入操作盘 <ChevronRight size={11} /></span>
                  </div>
                </button>
              );
            })
          ) : (
            currentGroup.items.map((device) => {
              const liveStatus = statuses[device.id] ?? device.status;
              const liveReading = readings[device.id] ?? device.reading;
              const firstMetric = Object.entries(liveReading)[0];
              return (
                <button
                  type="button"
                  key={device.id}
                  className={`ops-device-row ${selected?.id === device.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedId(device.id)}
                >
                  <span className="ops-device-row__icon"><DeviceIcon kind={device.kind as DeviceKind} size={16} /></span>
                  <span className="ops-device-row__name"><strong>{device.shortName}</strong><em>{device.id} · {device.zone}</em></span>
                  <span className="ops-device-row__kind">{device.kind === 'ugv' ? '无人车' : device.kind === 'usv' ? '无人船' : device.kind === 'satellite' ? '卫星' : device.kind === 'video' ? '视频' : device.kind === 'water' ? '水质' : device.kind === 'weather' ? '气象' : device.kind === 'air' ? '空气' : device.kind === 'soil' ? '墒情' : device.kind === 'geology' ? '地灾' : '网关'}</span>
                  <span className="ops-device-row__metric mono">{firstMetric ? `${firstMetric[1]} ${firstMetric[0]}` : '—'}</span>
                  <StatusText status={liveStatus as never} />
                </button>
              );
            })
          )}
        </div>

        {group === 'airports' && (
          <Panel
            overline="FLEET SITUATION"
            title="机队一张图"
            icon={MapPin}
            className="ops-fleet-panel"
            noPad
            extra={
              <Link className="ops-fleet-link mono" to="/map">
                全屏态势 <ChevronRight size={11} />
              </Link>
            }
          >
            <MapView className="ops-fleet-map" selectedId={selectedId} onSelect={focusDevice} initialZoom={11.9} />
          </Panel>
        )}
        </div>

        <Panel overline="DEVICE CONSOLE" title="机场操作盘" icon={Crosshair} className="ops-console">
          {selected ? (
            <div className="ops-console__body" key={selected.id}>
              <div className="ops-console__head">
                <span className="ops-console__glyph" style={{ color: 'var(--cyan)' }}>
                  <DeviceIcon kind={selected.kind as DeviceKind} size={26} />
                </span>
                <div>
                  <h3>{selected.name}</h3>
                  <span className="mono">{selected.id} · {selected.zone} · {selected.model}</span>
                </div>
                <StatusText status={(statuses[selected.id] ?? selected.status) as never} />
              </div>
              <div className="ops-console__facts">
                <div><span>接入协议</span><strong>{selected.protocol}</strong></div>
                <div><span>型号</span><strong>{selected.model}</strong></div>
                <div><span>信号</span><strong className="mono">{selected.signal}%</strong></div>
                <div><span>坐标</span><strong className="mono">{selected.lng.toFixed(4)}, {selected.lat.toFixed(4)}</strong></div>
              </div>
              <div className="ops-console__readings">
                {Object.entries(readings[selected.id] ?? selected.reading).slice(0, 6).map(([key, value]) => (
                  <div key={key}><span>{key}</span><strong className="mono">{String(value)}</strong></div>
                ))}
              </div>
              <div className="ops-console__actions">
                {(selected.kind === 'drone' || selected.kind === 'ugv' || selected.kind === 'usv') && (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => onOpenFlight(selected.id)}>
                    <Gamepad2 size={13} /> 进入飞控
                  </button>
                )}
                <button type="button" className="btn btn--sm" onClick={onOpenRoutes}>
                  <RouteIcon size={13} /> 航线规划
                </button>
                <Link className="btn btn--sm" to={`/map?focus=${selected.id}`}>
                  <MapPin size={13} /> 地图定位
                </Link>
              </div>
              <div className="ops-console__foot mono">
                {canOperate ? 'OPERATOR SESSION · 可执行飞行与任务操作' : 'VIEWER SESSION · 只读模式'}
              </div>
            </div>
          ) : (
            <div className="ops-empty"><Crosshair size={22} /><strong>选择左侧设备查看操作盘</strong></div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

function PlansView({
  data,
  canOperate,
  onExecute,
  onCreated,
}: {
  data: DroneOverview;
  canOperate: boolean;
  onExecute: (plan: FlightPlan) => void;
  onCreated: (plan: FlightPlan) => void;
}) {
  const [filter, setFilter] = useState<'active' | 'ended' | 'all'>('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? data.plans.find((item) => item.id === detailId) ?? null : null;
  const unfinished = data.plans.filter((plan) => plan.status === '未开始' || plan.status === '执行中' || plan.status === '已暂停');
  const finished = data.plans.filter((plan) => plan.status === '已完成' || plan.status === '执行失败');
  const source = filter === 'active' ? unfinished : filter === 'ended' ? finished : data.plans;
  const plans = source.filter((plan) => !query || `${plan.name}${plan.routeName}${plan.deviceId}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="ops-plans">
      <div className="ops-subbar">
        <div className="ops-subtabs">
          <button type="button" className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')}>未完成 <b>{unfinished.length}</b></button>
          <button type="button" className={filter === 'ended' ? 'is-active' : ''} onClick={() => setFilter('ended')}>已结束 <b>{finished.length}</b></button>
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>全部 <b>{data.plans.length}</b></button>
        </div>
        <div className="ops-subbar__right">
          <label className="ops-mini-search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索计划 / 航线 / 设备" />
          </label>
          <button type="button" className="btn btn--primary btn--sm" disabled={!canOperate || !data.routes.length} title={!data.routes.length ? '请先在航线规划中创建航线' : undefined} onClick={() => setModalOpen(true)}>
            <Plus size={13} /> 新建计划
          </button>
        </div>
      </div>

      <div className="ops-table ops-table--plans">
        <div className="ops-table__head">
          <span>计划 / 航线</span><span>飞行时间</span><span>关联设备</span><span>类型</span><span>状态</span><span>媒体上传</span><span>操作</span>
        </div>
        <div className="ops-table__body">
          {plans.map((plan) => {
            const percent = plan.mediaTotal ? Math.round((plan.mediaUploaded / plan.mediaTotal) * 100) : 0;
            return (
              <div className="ops-table__row" key={plan.id}>
                <span className="plan-name">
                  <em className="mono">{plan.id}</em>
                  <strong>{plan.name}</strong>
                  <small>{plan.routeName}</small>
                </span>
                <span className="plan-time">
                  <em>计划 {formatDateTime(plan.plannedStart)}</em>
                  <small>实际 {formatDateTime(plan.actualStart)}</small>
                </span>
                <span className="mono">{plan.deviceId}</span>
                <span><span className="task-type">{plan.taskType}</span></span>
                <span><PlanStatus status={plan.status} /></span>
                <span className="plan-media">
                  <strong className="mono">{plan.mediaUploaded}/{plan.mediaTotal || 0}</strong>
                  <span className="progress"><i style={{ width: `${percent}%` }} /></span>
                </span>
                <span className="plan-actions">
                  <button type="button" className="btn btn--sm" onClick={() => onExecute(plan)}>{plan.status === '已完成' ? '查看' : '执行'}</button>
                  <button type="button" className="icon-btn" title="计划详情" onClick={() => setDetailId(plan.id)}><ChevronRight size={13} /></button>
                </span>
              </div>
            );
          })}
          {!plans.length && <div className="ops-empty"><CalendarClock size={22} /><strong>没有符合条件的飞行计划</strong></div>}
        </div>
      </div>

      {modalOpen && (
        <PlanModal
          routes={data.routes}
          devices={[...data.fleet.airports, ...data.fleet.nonAirport]}
          onClose={() => setModalOpen(false)}
          onCreated={(plan) => {
            setModalOpen(false);
            onCreated(plan);
          }}
        />
      )}

      {detail && (
        <OpsModal title={detail.name} subtitle="FLIGHT PLAN DETAIL" onClose={() => setDetailId(null)}>
          <div className="media-preview__rows">
            <div><span>计划编号</span><strong className="mono">{detail.id}</strong></div>
            <div><span>当前状态</span><strong><PlanStatus status={detail.status} /></strong></div>
            <div><span>关联航线</span><strong>{detail.routeName}</strong></div>
            <div><span>执行设备</span><strong className="mono">{detail.deviceId}</strong></div>
            <div><span>任务类型</span><strong>{detail.taskType}</strong></div>
            <div><span>计划开始</span><strong>{formatDateTime(detail.plannedStart)}</strong></div>
            <div><span>计划结束</span><strong>{formatDateTime(detail.plannedEnd)}</strong></div>
            <div><span>实际开始</span><strong>{formatDateTime(detail.actualStart)}</strong></div>
            <div><span>实际结束</span><strong>{formatDateTime(detail.actualEnd)}</strong></div>
            <div><span>媒体上传</span><strong className="mono">{detail.mediaUploaded} / {detail.mediaTotal || 0}</strong></div>
            <div><span>创建时间</span><strong>{formatDateTime(detail.createdAt)}</strong></div>
          </div>
          {(() => {
            const route = data.routes.find((item) => item.id === detail.routeId);
            return route ? (
              <div className="ops-form__hint mono">
                {route.waypoints.length} WAYPOINTS · {distanceKm(route.waypoints).toFixed(2)} KM · 巡航 {route.altitude} M · {route.speed} M/S
              </div>
            ) : null;
          })()}
          <div className="ops-form__actions">
            <button type="button" className="btn btn--sm" onClick={() => setDetailId(null)}>关闭</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => { setDetailId(null); onExecute(detail); }}>进入飞控 <ChevronRight size={11} /></button>
          </div>
        </OpsModal>
      )}
    </div>
  );
}

function PlanModal({
  routes,
  devices,
  onClose,
  onCreated,
}: {
  routes: DroneRoute[];
  devices: DroneDeviceCard[];
  onClose: () => void;
  onCreated: (plan: FlightPlan) => void;
}) {
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  const localInput = (date: Date) => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
  };
  const [name, setName] = useState('河道巡检计划');
  const [routeId, setRouteId] = useState(routes[0]?.id ?? '');
  const selectedRoute = routes.find((route) => route.id === routeId);
  const [deviceId, setDeviceId] = useState(selectedRoute?.deviceId ?? devices[0]?.id ?? 'UAV-01');
  const [taskType, setTaskType] = useState('自动任务');
  const [start, setStart] = useState(localInput(now));
  const [finish, setFinish] = useState(localInput(end));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim() || !routeId || !start || !finish) {
      setError('请填写计划名称、航线和执行时间');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const plan = await createDronePlan({
        name: name.trim(),
        route_id: routeId,
        device_id: deviceId,
        task_type: taskType,
        planned_start: new Date(start).toISOString(),
        planned_end: new Date(finish).toISOString(),
      });
      onCreated(plan);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建计划失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OpsModal title="新建飞行计划" subtitle="FLIGHT PLAN · DISPATCH" onClose={onClose}>
      <div className="ops-form">
        <label><span>计划名称</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>执行航线</span>
          <select value={routeId} onChange={(event) => {
            setRouteId(event.target.value);
            const route = routes.find((item) => item.id === event.target.value);
            if (route) setDeviceId(route.deviceId);
          }}>
            {routes.map((route) => <option key={route.id} value={route.id}>{route.name} · {route.routeType}</option>)}
          </select>
        </label>
        <div className="ops-form__pair">
          <label><span>关联设备</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{devices.map((device) => <option key={device.id} value={device.id}>{device.shortName} · {device.id}</option>)}</select></label>
          <label><span>任务类型</span><select value={taskType} onChange={(event) => setTaskType(event.target.value)}><option>自动任务</option><option>定时任务</option><option>连续任务</option></select></label>
        </div>
        <div className="ops-form__pair">
          <label><span>计划开始</span><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label><span>计划结束</span><input type="datetime-local" value={finish} onChange={(event) => setFinish(event.target.value)} /></label>
        </div>
        {selectedRoute && <div className="ops-form__hint mono">{selectedRoute.waypoints.length} WAYPOINTS · {distanceKm(selectedRoute.waypoints).toFixed(2)} KM · {selectedRoute.altitude} M</div>}
        {error && <div className="ops-form__error"><CircleAlert size={12} />{error}</div>}
        <div className="ops-form__actions">
          <button type="button" className="btn btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void submit()}>{saving ? '创建中…' : <>创建计划 <ChevronRight size={11} /></>}</button>
        </div>
      </div>
    </OpsModal>
  );
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

function RoutesView({
  data,
  canOperate,
  notify,
  onSaved,
  onDeleted,
}: {
  data: DroneOverview;
  canOperate: boolean;
  notify: (message: string) => void;
  onSaved: (route: DroneRoute, isNew: boolean) => void;
  onDeleted: (routeId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(data.routes[0]?.id ?? null);
  const [isNew, setIsNew] = useState(!data.routes.length);
  const [draft, setDraft] = useState<Omit<DroneRoute, 'id' | 'createdAt' | 'updatedAt'>>(
    data.routes[0] ? { ...data.routes[0] } : { name: '新航线', routeType: '航点巡检', deviceId: 'UAV-01', waypoints: [], altitude: 120, speed: 8, gimbalPitch: -25 },
  );
  const [saving, setSaving] = useState(false);

  const selectRoute = (route: DroneRoute) => {
    setSelectedId(route.id);
    setIsNew(false);
    setDraft({
      name: route.name,
      routeType: route.routeType,
      deviceId: route.deviceId,
      waypoints: route.waypoints,
      altitude: route.altitude,
      speed: route.speed,
      gimbalPitch: route.gimbalPitch,
    });
  };

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setDraft({ name: '新航线', routeType: '航点巡检', deviceId: data.fleet.airports[0]?.id ?? 'UAV-01', waypoints: [], altitude: 120, speed: 8, gimbalPitch: -25 });
  };

  const save = async () => {
    if (!canOperate) return;
    if (draft.name.trim().length === 0) return;
    if (draft.waypoints.length < 2) return;
    setSaving(true);
    try {
      const saved = await saveDroneRoute(
        {
          name: draft.name.trim(),
          route_type: draft.routeType,
          device_id: draft.deviceId,
          waypoints: draft.waypoints,
          altitude: draft.altitude,
          speed: draft.speed,
          gimbal_pitch: draft.gimbalPitch,
        },
        isNew ? undefined : selectedId ?? undefined,
      );
      const wasNew = isNew;
      setSelectedId(saved.id);
      setIsNew(false);
      setDraft({
        name: saved.name,
        routeType: saved.routeType,
        deviceId: saved.deviceId,
        waypoints: saved.waypoints,
        altitude: saved.altitude,
        speed: saved.speed,
        gimbalPitch: saved.gimbalPitch,
      });
      onSaved(saved, wasNew);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '航线保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (route: DroneRoute) => {
    if (!canOperate) return;
    if (!window.confirm(`删除航线「${route.name}」？已被飞行计划引用的航线无法删除。`)) return;
    try {
      await deleteDroneRoute(route.id);
      onDeleted(route.id);
      if (selectedId === route.id) {
        const rest = data.routes.filter((item) => item.id !== route.id);
        if (rest.length) selectRoute(rest[0]);
        else startNew();
      }
      notify(`航线「${route.name}」已删除`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '航线删除失败');
    }
  };

  return (
    <div className="ops-routes">
      <div className="ops-route-list">
        <div className="ops-route-list__head">
          <span className="overline">ROUTE LIBRARY</span>
          <button type="button" className="btn btn--sm" disabled={!canOperate} onClick={startNew}><Plus size={12} /> 新建</button>
        </div>
        {data.routes.map((route) => (
          <div
            key={route.id}
            role="button"
            tabIndex={0}
            className={`route-card ${selectedId === route.id ? 'is-active' : ''}`}
            onClick={() => selectRoute(route)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectRoute(route);
              }
            }}
          >
            <span className="route-card__icon"><RouteIcon size={14} /></span>
            <span className="route-card__name"><strong>{route.name}</strong><em>{route.routeType} · {route.waypoints.length} 航点</em></span>
            <span className="route-card__meta mono">{distanceKm(route.waypoints).toFixed(1)} km<ChevronRight size={11} /></span>
            <button
              type="button"
              className="icon-btn"
              disabled={!canOperate}
              title={canOperate ? '删除航线' : '观察员为只读角色'}
              aria-label={`删除航线 ${route.name}`}
              onClick={(event) => {
                event.stopPropagation();
                void remove(route);
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {isNew && (
          <div className="route-card is-draft">
            <span className="route-card__icon"><Plus size={14} /></span>
            <span className="route-card__name"><strong>{draft.name}</strong><em>未保存 · {draft.waypoints.length} 航点</em></span>
          </div>
        )}
        <div className="ops-route-list__foot mono">
          <RouteIcon size={11} /> TOTAL {data.routes.length} ROUTES
        </div>
      </div>

      <div className="ops-route-editor">
        <div className="ops-route-form">
          <div className="ops-route-form__title">
            <span className="overline">{isNew ? 'NEW ROUTE' : selectedId ?? 'ROUTE'}</span>
            <strong>{isNew ? '新建航线' : '航线参数'}</strong>
          </div>
          <label><span>航线名称</span><input value={draft.name} disabled={!canOperate} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label><span>任务类型</span><select value={draft.routeType} disabled={!canOperate} onChange={(event) => setDraft({ ...draft, routeType: event.target.value })}><option>航点巡检</option><option>二维测绘</option><option>三维建模</option><option>环绕测绘</option><option>倾斜建图</option></select></label>
          <label><span>执行设备</span><select value={draft.deviceId} disabled={!canOperate} onChange={(event) => setDraft({ ...draft, deviceId: event.target.value })}>{data.fleet.airports.map((device) => <option key={device.id} value={device.id}>{device.shortName} · {device.id}</option>)}{data.fleet.nonAirport.filter((device) => device.kind !== 'satellite').map((device) => <option key={device.id} value={device.id}>{device.shortName} · {device.id}</option>)}</select></label>
          <div className="ops-route-form__pair">
            <label><span>相对高度</span><input type="number" min={20} max={500} value={draft.altitude} disabled={!canOperate} onChange={(event) => setDraft({ ...draft, altitude: Number(event.target.value) })} /><em>m</em></label>
            <label><span>飞行速度</span><input type="number" min={1} max={20} step={0.1} value={draft.speed} disabled={!canOperate} onChange={(event) => setDraft({ ...draft, speed: Number(event.target.value) })} /><em>m/s</em></label>
          </div>
          <label><span>云台俯仰</span><input type="number" min={-90} max={30} value={draft.gimbalPitch} disabled={!canOperate} onChange={(event) => setDraft({ ...draft, gimbalPitch: Number(event.target.value) })} /><em>°</em></label>
          <div className="ops-route-form__stats mono">
            <span>{draft.waypoints.length} WAYPOINTS</span>
            <span>{distanceKm(draft.waypoints).toFixed(2)} KM</span>
            <span>~{Math.max(1, Math.round(distanceKm(draft.waypoints) / Math.max(1, draft.speed) * 60))} MIN</span>
          </div>
          <button type="button" className="btn btn--primary btn--sm ops-route-form__save" disabled={!canOperate || saving || draft.waypoints.length < 2 || !draft.name.trim()} onClick={() => void save()}>
            {saving ? '保存中…' : isNew ? '创建航线' : '保存航线'} <ChevronRight size={12} />
          </button>
        </div>

        <div className="ops-route-map-wrap">
          <RouteEditorMap
            waypoints={draft.waypoints}
            editable={canOperate}
            onChange={(waypoints) => setDraft({ ...draft, waypoints })}
            resetKey={isNew ? 'new' : selectedId ?? 'draft'}
          />
          <div className="ops-waypoints">
            <div className="ops-waypoints__head"><span className="overline">WAYPOINT SEQUENCE</span><span className="mono">{draft.waypoints.length} POINTS</span></div>
            <div className="ops-waypoints__list">
              {draft.waypoints.map((point, index) => (
                <div className="waypoint-row" key={`${index}-${point.lng}-${point.lat}`}>
                  <span className="waypoint-row__index mono">{String(index + 1).padStart(2, '0')}</span>
                  <span className="waypoint-row__name"><strong>{point.name ?? `航点 ${index + 1}`}</strong><em>{point.action} · {point.altitude}m</em></span>
                  <span className="waypoint-row__coord mono">{point.lng.toFixed(4)}, {point.lat.toFixed(4)}</span>
                  <button type="button" className="icon-btn" title="删除航点" aria-label={`删除航点 ${index + 1}`} disabled={!canOperate} onClick={() => setDraft({ ...draft, waypoints: draft.waypoints.filter((_, i) => i !== index) })}><Trash2 size={12} /></button>
                </div>
              ))}
              {!draft.waypoints.length && <div className="ops-waypoints__empty">点击地图添加第一个航点，至少 2 个航点可保存</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flight                                                              */
/* ------------------------------------------------------------------ */

function FlightView({
  data,
  activePlan,
  canOperate,
  onSelectPlan,
  onPlanUpdated,
  notify,
}: {
  data: DroneOverview;
  activePlan: FlightPlan | null;
  canOperate: boolean;
  onSelectPlan: (id: string) => void;
  onPlanUpdated: (plan: FlightPlan, command?: FlightCommand) => void;
  notify: (message: string) => void;
}) {
  const { readings } = useSimulation();
  const [phase, setPhase] = useState<'ready' | 'running' | 'paused' | 'done'>('ready');
  const [progress, setProgress] = useState(0);
  const [view, setView] = useState<'first' | 'ai'>('first');
  const [localLog, setLocalLog] = useState<FlightCommand[]>([]);
  const [busy, setBusy] = useState(false);
  const completeRef = useRef(false);

  useEffect(() => {
    completeRef.current = false;
    setLocalLog([]);
    setBusy(false);
    if (!activePlan) {
      setPhase('ready');
      setProgress(0);
      return;
    }
    if (activePlan.status === '已完成') {
      setPhase('done');
      setProgress(100);
    } else if (activePlan.status === '已暂停') {
      setPhase('paused');
      setProgress(48);
    } else if (activePlan.status === '执行中') {
      setPhase('ready');
      setProgress(35);
    } else {
      setPhase('ready');
      setProgress(0);
    }
  }, [activePlan?.id]);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(100, value + 1.4));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const completeMission = useCallback(async () => {
    if (!activePlan || busy) return;
    setBusy(true);
    try {
      const result = await sendDroneCommand(activePlan.id, 'complete');
      onPlanUpdated(result.plan, result.command);
      setLocalLog((items) => [result.command, ...items]);
      setPhase('done');
      notify('任务已完成，媒体上传与 AI 线索已归档');
    } catch (reason) {
      completeRef.current = false;
      setPhase('paused');
      notify(reason instanceof Error ? reason.message : '任务完成状态回写失败，可重试归档');
    } finally {
      setBusy(false);
    }
  }, [activePlan, busy, notify, onPlanUpdated]);

  useEffect(() => {
    if (!activePlan || busy || phase !== 'running' || progress < 100 || completeRef.current) return;
    completeRef.current = true;
    void completeMission();
  }, [activePlan, busy, completeMission, phase, progress]);

  const attach = () => {
    if (!activePlan || !canOperate) return;
    completeRef.current = false;
    setProgress((value) => (value >= 100 ? 0 : value));
    setPhase('running');
    notify('已接续正在执行的计划，进入本地飞控视角');
  };

  const command = async (name: 'takeoff' | 'pause' | 'resume' | 'hover' | 'return' | 'land') => {
    if (!activePlan || !canOperate || busy) return;
    setBusy(true);
    try {
      const result = await sendDroneCommand(activePlan.id, name);
      onPlanUpdated(result.plan, result.command);
      setLocalLog((items) => [result.command, ...items]);
      if (name === 'takeoff' || name === 'resume' || name === 'return') {
        completeRef.current = false;
        if (name !== 'return' && progress >= 100) setProgress(0);
        setPhase('running');
      } else if (name === 'pause') {
        setPhase('paused');
      } else if (name === 'land') {
        setProgress(100);
        setPhase('done');
      }
      notify(`指令已下发：${COMMAND_LABELS[name] ?? name}`);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : '飞控指令下发失败');
    } finally {
      setBusy(false);
    }
  };

  if (!activePlan) {
    return (
      <div className="ops-empty ops-empty--large">
        <Gamepad2 size={28} />
        <strong>还没有选中的飞行计划</strong>
        <p>请先在任务计划中选择一条计划，再进入实时飞控。</p>
      </div>
    );
  }

  const deviceReading = readings[activePlan.deviceId] ?? {};
  const altitude = phase === 'done' ? 0 : Math.round(20 + progress * 1.15);
  const speed = phase === 'running' ? 8.4 : phase === 'done' ? 0 : 0;
  const battery = Math.max(16, Math.round((deviceReading.battery ?? 86) - progress * 0.09));
  const mediaPercent = activePlan.mediaTotal ? Math.round((activePlan.mediaUploaded / activePlan.mediaTotal) * 100) : 0;
  const seenCommands = new Set<number>();
  const commands = [...localLog, ...data.commands.filter((item) => item.planId === activePlan.id)]
    .filter((item) => {
      if (seenCommands.has(item.id)) return false;
      seenCommands.add(item.id);
      return true;
    })
    .slice(0, 8);
  const planOptions = data.plans;
  const videoImage = view === 'first' ? '/assets/aerial-river.jpg' : '/assets/aerial-fire.jpg';
  const needsCompletionRetry = progress >= 100 && phase === 'paused';
  const airborne = phase === 'running' || phase === 'paused' || activePlan.status === '执行中';
  const primaryLabel = busy ? '下发中' :
    phase === 'running' ? '执行中' :
      needsCompletionRetry ? '重试归档' :
        phase === 'paused' ? '继续' :
          phase === 'done' ? '已完成' :
            activePlan.status === '执行中' ? '接续飞控' :
              activePlan.status === '未开始' ? '起飞' : '不可操作';
  const primaryDisabled =
    !canOperate || busy || phase === 'running' || phase === 'done' ||
    (phase === 'ready' && activePlan.status !== '执行中' && activePlan.status !== '未开始');
  const primaryAction = () => {
    if (needsCompletionRetry) {
      void completeMission();
      return;
    }
    if (phase === 'paused') {
      void command('resume');
      return;
    }
    if (phase === 'ready' && activePlan.status === '执行中') {
      attach();
      return;
    }
    void command('takeoff');
  };

  return (
    <div className="ops-flight">
      <div className="ops-subbar">
        <div className="ops-subtabs">
          <button type="button" className="is-active"><span className="live-dot" /> 实时飞控</button>
        </div>
        <div className="ops-subbar__right">
          <span className="mono">ACTIVE PLAN</span>
          <select className="ops-plan-select" value={activePlan.id} onChange={(event) => onSelectPlan(event.target.value)}>
            {planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.status}</option>)}
          </select>
        </div>
      </div>

      <div className="ops-flight__grid">
        <div className="flight-visual">
          <div className="flight-visual__head">
            <span className="flight-live"><i /> SIM LIVE</span>
            <span className="mono">CAM-01 · {view === 'first' ? '第一视角' : '第二视角 AI'}</span>
            <div className="camera-switch">
              <button type="button" className={view === 'first' ? 'is-active' : ''} onClick={() => setView('first')}>第一视角</button>
              <button type="button" className={view === 'ai' ? 'is-active' : ''} onClick={() => setView('ai')}>第二视角 AI</button>
            </div>
          </div>
          <div className={`flight-video ${view === 'ai' ? 'is-ai' : ''}`}>
            <img key={videoImage} src={videoImage} alt="无人机回传画面" width={1280} height={852} decoding="async" />
            <div className="flight-video__scan" />
            {view === 'ai' && (
              <>
                <span className="detect-box detect-box--a"><em>烟点 0.96</em></span>
                <span className="detect-box detect-box--b"><em>热源 0.91</em></span>
                <div className="flight-video__ai mono">AI MODEL A-01 · 烟火识别 v2.3</div>
              </>
            )}
            <div className="flight-hud">
              <span><em>ALT</em><strong className="mono">{altitude.toFixed(0)} m</strong></span>
              <span><em>SPD</em><strong className="mono">{speed.toFixed(1)} m/s</strong></span>
              <span><em>BAT</em><strong className="mono">{battery}%</strong></span>
              <span><em>HDG</em><strong className="mono">064°</strong></span>
            </div>
            <div className="flight-hud__bottom mono">{activePlan.name} · {activePlan.routeName}</div>
          </div>
          <div className="flight-connection">
            <span><i /> MQTT / TLS</span>
            <span><i /> RTK FIX</span>
            <span><i /> 4G LINK</span>
            <span className="flight-connection__right mono">{data.mqtt.connected ? '链路正常' : '链路重连中'}</span>
          </div>
        </div>

        <aside className="flight-cockpit">
          <div className="cockpit-head">
            <div><span className="overline">FLIGHT CONTROL</span><h3>{activePlan.name}</h3><span>{activePlan.routeName} · {activePlan.deviceId}</span></div>
            <PlanStatus status={activePlan.status} />
          </div>

          <div className="flight-progress">
            <div><span>任务进度</span><strong className="mono">{Math.round(progress)}%</strong></div>
            <div className="progress progress--lg"><i style={{ width: `${progress}%` }} /></div>
            <div className="flight-progress__meta"><span>媒体上传 {activePlan.mediaUploaded}/{activePlan.mediaTotal}</span><span className="mono">{mediaPercent}%</span></div>
          </div>

          <div className="flight-telemetry">
            <div><span><Gauge size={12} /> 高度</span><strong className="mono">{altitude} m</strong></div>
            <div><span><Navigation size={12} /> 速度</span><strong className="mono">{speed.toFixed(1)} m/s</strong></div>
            <div><span><BatteryCharging size={12} /> 电量</span><strong className="mono">{battery}%</strong></div>
            <div><span><Wind size={12} /> 风速</span><strong className="mono">2.8 m/s</strong></div>
            <div><span><Crosshair size={12} /> 坐标</span><strong className="mono">102.111, 36.493</strong></div>
            <div><span><Clock3 size={12} /> 航时</span><strong className="mono">00:{String(Math.round(progress * 0.3)).padStart(2, '0')}</strong></div>
          </div>

          <div className="flight-commands">
            <span className="overline">FLIGHT COMMANDS</span>
            <div className="command-grid">
              <button type="button" className={`command command--primary ${phase === 'running' ? 'is-live' : ''}`} disabled={primaryDisabled} onClick={primaryAction}><ArrowUp size={16} /><span>{primaryLabel}</span></button>
              <button type="button" className="command" disabled={!canOperate || busy || phase !== 'running'} onClick={() => void command('pause')}><Pause size={15} /><span>暂停</span></button>
              <button type="button" className="command" disabled={!canOperate || busy || !airborne} onClick={() => void command('hover')}><Home size={15} /><span>悬停</span></button>
              <button type="button" className="command" disabled={!canOperate || busy || !airborne} onClick={() => void command('return')}><Navigation size={15} /><span>返航</span></button>
              <button type="button" className="command command--danger" disabled={!canOperate || busy || !airborne} onClick={() => void command('land')}><ArrowDown size={15} /><span>降落</span></button>
            </div>
            {!canOperate && <div className="flight-readonly"><ShieldCheck size={12} /> 观察员只读 · 飞控指令不可用</div>}
          </div>

          <div className="flight-command-log">
            <div className="flight-command-log__head"><span className="overline">COMMAND LOG</span><span className="mono">{commands.length}</span></div>
            {commands.map((item) => (
              <div className="flight-command-row" key={item.id}>
                <span className="mono">{formatClock(item.createdAt)}</span>
                <strong>{COMMAND_LABELS[item.command] ?? item.command}</strong>
                <em>{item.actor}</em>
              </div>
            ))}
            {!commands.length && <div className="flight-command-log__empty">等待第一条飞控指令</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

function MediaView({ data }: { data: DroneOverview }) {
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'archive'>('all');
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const all = data.media;
  const media = all.filter((item) => filter === 'all' || item.mediaType === filter);
  const counts = {
    image: all.filter((item) => item.mediaType === 'image').length,
    video: all.filter((item) => item.mediaType === 'video').length,
    archive: all.filter((item) => item.mediaType === 'archive').length,
  };

  return (
    <div className="ops-media">
      <div className="ops-subbar">
        <div className="ops-subtabs">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>全部文件 <b>{all.length}</b></button>
          <button type="button" className={filter === 'image' ? 'is-active' : ''} onClick={() => setFilter('image')}>图片 <b>{counts.image}</b></button>
          <button type="button" className={filter === 'video' ? 'is-active' : ''} onClick={() => setFilter('video')}>视频 <b>{counts.video}</b></button>
          <button type="button" className={filter === 'archive' ? 'is-active' : ''} onClick={() => setFilter('archive')}>压缩文件 <b>{counts.archive}</b></button>
        </div>
        <div className="ops-subbar__right"><span className="mono">PROJECT SPACE · 120.2 GB / 188.1 GB</span></div>
      </div>

      <div className="ops-space-usage">
        <div><span className="overline">PROJECT STORAGE</span><strong>120.2 GB</strong><em>总容量 188.1 GB</em></div>
        <div className="progress"><i style={{ width: '64%' }} /></div>
        <div className="ops-space-usage__legend"><span><i className="is-cyan" /> 图片</span><span><i className="is-violet" /> 视频</span><span><i className="is-amber" /> 压缩文件</span><span><i className="is-muted" /> 剩余</span></div>
      </div>

      <div className="media-grid" key={filter}>
        {media.map((asset, index) => (
          <button type="button" className="media-card" key={asset.id} style={{ '--i': index } as CSSProperties} onClick={() => setSelected(asset)}>
            <div className={`media-card__thumb ${asset.mediaType === 'archive' ? 'is-archive' : ''}`}>
              {asset.mediaType === 'archive' ? (
                <FolderArchive size={32} />
              ) : (
                <img src={asset.url} alt={asset.name} width={1280} height={852} loading="lazy" decoding="async" />
              )}
              <span className="media-card__type">{asset.mediaType === 'image' ? <Camera size={11} /> : asset.mediaType === 'video' ? <Video size={11} /> : <FolderArchive size={11} />} {asset.mediaType === 'image' ? 'JPG' : asset.mediaType === 'video' ? 'MP4' : 'ZIP'}</span>
              {asset.mediaType !== 'archive' && <span className="media-card__play"><Play size={13} /></span>}
            </div>
            <div className="media-card__body">
              <strong>{asset.name}</strong>
              <span>{asset.planName ?? '未关联计划'} · {asset.routeName ?? '—'}</span>
              <em className="mono">{asset.resolution} · {formatSize(asset.sizeBytes)} · {formatDateTime(asset.capturedAt)}</em>
            </div>
          </button>
        ))}
        {!media.length && <div className="ops-empty"><Video size={22} /><strong>该类型下还没有媒体成果</strong></div>}
      </div>

      {selected && (
        <OpsModal title="媒体预览" subtitle="MEDIA PREVIEW · ORIGINAL ASSET" onClose={() => setSelected(null)} wide>
          <div className="media-preview">
            <div className="media-preview__visual">
              {selected.mediaType === 'archive' ? (
                <div className="media-preview__archive"><FolderArchive size={42} /><strong>{selected.name}</strong><span>正射成果压缩包，暂不支持在线预览</span></div>
              ) : (
                <img src={selected.url} alt={selected.name} width={1280} height={852} loading="lazy" decoding="async" />
              )}
              <div className="media-preview__pose mono">方位 {selected.heading.toFixed(0)}° · 俯仰 {selected.pitch.toFixed(0)}°</div>
            </div>
            <aside className="media-preview__meta">
              <span className="overline">ASSET METADATA</span>
              <h4>{selected.name}</h4>
              <div className="media-preview__rows">
                <div><span>任务</span><strong>{selected.planName ?? '—'}</strong></div>
                <div><span>航线</span><strong>{selected.routeName ?? '—'}</strong></div>
                <div><span>分辨率</span><strong>{selected.resolution}</strong></div>
                <div><span>文件大小</span><strong>{formatSize(selected.sizeBytes)}</strong></div>
                <div><span>拍摄时间</span><strong>{formatDateTime(selected.capturedAt)}</strong></div>
                <div><span>空间位置</span><strong className="mono">{selected.lng.toFixed(5)}, {selected.lat.toFixed(5)}</strong></div>
              </div>
              <div className="media-preview__map">
                <span className="media-preview__pin"><MapPin size={14} /></span>
                <em className="mono">PING'AN · 平安区</em>
              </div>
              <div className="media-preview__actions">
                {selected.url && <a className="btn btn--primary btn--sm" href={selected.url} download><Download size={12} /> 下载文件</a>}
                <button type="button" className="btn btn--sm" onClick={() => setSelected(null)}>关闭</button>
              </div>
            </aside>
          </div>
        </OpsModal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AI clues                                                            */
/* ------------------------------------------------------------------ */

function CluesView({
  data,
  canOperate,
  onUpdate,
}: {
  data: DroneOverview;
  canOperate: boolean;
  onUpdate: (clueId: string, status: AiClue['status']) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<'全部' | '待处理' | '已核实' | '已忽略'>('全部');
  const [selected, setSelected] = useState<AiClue | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const act = async (clueId: string, next: AiClue['status']) => {
    if (pendingId) return;
    setPendingId(clueId);
    const ok = await onUpdate(clueId, next);
    setPendingId(null);
    if (ok) {
      setSelected((current) => (current && current.id === clueId ? { ...current, status: next } : current));
    }
  };
  const clues = data.clues.filter((clue) => status === '全部' || clue.status === status);
  const mediaById = new Map(data.media.map((asset) => [asset.id, asset]));
  const modelById = new Map(data.models.map((model) => [model.id, model]));
  const counts = {
    pending: data.clues.filter((clue) => clue.status === '待处理').length,
    verified: data.clues.filter((clue) => clue.status === '已核实').length,
    ignored: data.clues.filter((clue) => clue.status === '已忽略').length,
  };
  const total = Math.max(1, data.clues.length);

  return (
    <div className="ops-clues">
      <div className="ops-clues__stats">
        <div className="clue-donut" style={{ '--pending': `${(counts.pending / total) * 100}%`, '--verified': `${(counts.verified / total) * 100}%` } as CSSProperties}>
          <div><strong>{data.clues.length}</strong><span>线索总数</span></div>
        </div>
        <div className="clue-stat">
          <span><i className="is-amber" /> 待处理</span><strong className="mono">{counts.pending}</strong>
          <em>需要人工研判</em>
        </div>
        <div className="clue-stat">
          <span><i className="is-teal" /> 已核实</span><strong className="mono">{counts.verified}</strong>
          <em>已进入处置流程</em>
        </div>
        <div className="clue-stat">
          <span><i className="is-muted" /> 已忽略</span><strong className="mono">{counts.ignored}</strong>
          <em>误报或无需处置</em>
        </div>
        <div className="ops-model-strip">
          <span className="overline">AI MODEL LIBRARY</span>
          {data.models.map((model) => (
            <div key={model.id}>
              <span className="model-dot" />
              <strong>{model.name}</strong>
              <em className="mono">{model.version} · {model.target}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="ops-subbar">
        <div className="ops-subtabs">
          {(['全部', '待处理', '已核实', '已忽略'] as const).map((item) => (
            <button type="button" key={item} className={status === item ? 'is-active' : ''} onClick={() => setStatus(item)}>{item} <b>{item === '全部' ? data.clues.length : counts[item === '待处理' ? 'pending' : item === '已核实' ? 'verified' : 'ignored']}</b></button>
          ))}
        </div>
        <div className="ops-subbar__right"><span className="mono">CLUE CLOSED LOOP · {data.models.length} MODELS ONLINE</span></div>
      </div>

      <div className="clue-list" key={status}>
        {clues.map((clue, index) => {
          const asset = clue.mediaId ? mediaById.get(clue.mediaId) : undefined;
          const model = modelById.get(clue.modelId);
          return (
            <div className="clue-row" key={clue.id} style={{ '--i': index } as CSSProperties} onClick={() => setSelected(clue)}>
              <button type="button" className="clue-row__thumb" onClick={() => setSelected(clue)}>
                {asset?.url ? <img src={asset.url} alt={clue.title} width={1280} height={852} loading="lazy" decoding="async" /> : <ScanEye size={20} />}
                <span>{clue.objectCount}</span>
              </button>
              <div className="clue-row__main">
                <span className="overline">{model?.name ?? clue.modelId} · {model?.version ?? '—'}</span>
                <strong>{clue.title}</strong>
                <em>{clue.routeName ?? '—'} · {clue.planId ?? '—'} · {formatDateTime(clue.capturedAt)}</em>
              </div>
              <div className="clue-row__objects"><strong className="mono">{clue.objectCount}</strong><span>目标</span></div>
              <div className="clue-row__status"><ClueStatus status={clue.status} /></div>
              <div className="clue-row__actions" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="btn btn--sm" onClick={() => setSelected(clue)}>查看</button>
                <button type="button" className="btn btn--sm" disabled={!canOperate || pendingId === clue.id || clue.status === '已核实'} onClick={() => void act(clue.id, '已核实')}>核实</button>
                <button type="button" className="icon-btn" disabled={!canOperate || pendingId === clue.id || clue.status === '已忽略'} title="忽略" aria-label="忽略线索" onClick={() => void act(clue.id, '已忽略')}><Ban size={13} /></button>
              </div>
            </div>
          );
        })}
        {!clues.length && <div className="ops-empty"><ScanEye size={22} /><strong>没有符合条件的 AI 线索</strong></div>}
      </div>

      {selected && (
        <OpsModal title="识别线索详情" subtitle="AI CLUE · REVIEW" onClose={() => setSelected(null)} wide>
          <div className="clue-detail">
            <div className="clue-detail__visual">
              {(() => {
                const asset = selected.mediaId ? mediaById.get(selected.mediaId) : undefined;
                return asset?.url ? <img src={asset.url} alt={selected.title} width={1280} height={852} loading="lazy" decoding="async" /> : <div className="media-preview__archive"><ScanEye size={40} /><span>无关联影像</span></div>;
              })()}
              <span className="detect-box detect-box--a"><em>{selected.objectCount} 个目标</em></span>
            </div>
            <div className="clue-detail__meta">
              <span className="overline">CLUE EVIDENCE</span>
              <h4>{selected.title}</h4>
              <div className="media-preview__rows">
                <div><span>模型</span><strong>{modelById.get(selected.modelId)?.name ?? selected.modelId}</strong></div>
                <div><span>任务</span><strong>{selected.planId ?? '—'}</strong></div>
                <div><span>航线</span><strong>{selected.routeName ?? '—'}</strong></div>
                <div><span>目标数</span><strong className="mono">{selected.objectCount}</strong></div>
                <div><span>时间</span><strong>{formatDateTime(selected.capturedAt)}</strong></div>
                <div><span>位置</span><strong className="mono">{selected.lng.toFixed(5)}, {selected.lat.toFixed(5)}</strong></div>
              </div>
              <div className="clue-detail__actions">
                <button type="button" className="btn btn--primary btn--sm" disabled={!canOperate || pendingId === selected.id || selected.status === '已核实'} onClick={() => void act(selected.id, '已核实')}><Check size={12} /> 核实线索</button>
                <button type="button" className="btn btn--sm" disabled={!canOperate || pendingId === selected.id || selected.status === '已忽略'} onClick={() => void act(selected.id, '已忽略')}><Ban size={12} /> 标记忽略</button>
                <button type="button" className="btn btn--sm" onClick={() => setSelected(null)}>关闭</button>
              </div>
            </div>
          </div>
        </OpsModal>
      )}
    </div>
  );
}
