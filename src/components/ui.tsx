import { useEffect, useId, useRef, type ReactNode } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CloudSun,
  Cpu,
  Gauge,
  Mountain,
  Plane,
  Router,
  Satellite,
  Ship,
  Sprout,
  TrendingDown,
  TrendingUp,
  Truck,
  Video,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { DeviceKind, DeviceStatus } from '../data/devices';
import type { AlertLevel, SimEvent } from '../engine/simulation';

export function Panel({
  id,
  title,
  overline,
  icon: Icon,
  extra,
  children,
  className = '',
  noPad = false,
}: {
  id?: string;
  title?: string;
  overline?: string;
  icon?: LucideIcon;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
      {(title || extra) && (
        <header className="panel-head">
          <div className="panel-title-wrap">
            {overline && <span className="overline">{overline}</span>}
            <h3 className="panel-title">
              {Icon && (
                <span className="panel-title-icon">
                  <Icon size={14} strokeWidth={1.8} />
                </span>
              )}
              {title}
            </h3>
          </div>
          {extra && <div className="panel-extra">{extra}</div>}
        </header>
      )}
      <div className={noPad ? 'panel-body panel-body--flush' : 'panel-body'}>{children}</div>
    </section>
  );
}

export function StatusPill({
  tone = 'online',
  children,
  dot = true,
}: {
  tone?: 'online' | 'warning' | 'danger' | 'muted' | 'ai';
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      {dot && <i className="status-pill__dot" />}
      {children}
    </span>
  );
}

export function StatusText({ status }: { status: DeviceStatus }) {
  const map = {
    online: { label: '在线', tone: 'online' as const },
    warning: { label: '预警', tone: 'warning' as const },
    offline: { label: '离线', tone: 'muted' as const },
  };
  return <StatusPill tone={map[status].tone}>{map[status].label}</StatusPill>;
}

export function LevelPill({ level }: { level: AlertLevel }) {
  const map = {
    critical: { label: '严重', className: 'level-pill--critical' },
    warning: { label: '警告', className: 'level-pill--warning' },
    info: { label: '提示', className: 'level-pill--info' },
  };
  return <span className={`level-pill ${map[level].className}`}>{map[level].label}</span>;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`seg segmented--${size}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`seg__item ${option.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  color = 'var(--cyan)',
  height = 5,
  label,
}: {
  value: number;
  color?: string;
  height?: number;
  label?: string;
}) {
  return (
    <div className="progress-wrap">
      {label && (
        <div className="progress-label">
          <span>{label}</span>
          <span className="mono">{Math.round(value)}%</span>
        </div>
      )}
      <div className="progress" style={{ height }}>
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
      </div>
    </div>
  );
}

export function Sparkline({
  data,
  color = '#4be1ff',
  height = 32,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const rawId = useId();
  const id = `sp${rawId.replace(/[:]/g, '')}`;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const points = data.map((value, index) => {
    const x = (index / Math.max(1, data.length - 1)) * 120;
    const y = 30 - ((value - min) / span) * 26;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `M0,32 L${points.join(' L')} L120,32 Z`;
  return (
    <svg className="sparkline" viewBox="0 0 120 32" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Donut({
  value,
  size = 92,
  stroke = 7,
  color = '#4be1ff',
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 5px ${color}88)` }}
        />
      </svg>
      <div className="donut__center">
        <strong className="mono">{value.toFixed(1)}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

export function EChart({
  option,
  height = 260,
  className = '',
  onClick,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onClick?: (params: echarts.ECElementEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.on('click', (params) => clickRef.current?.(params));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 不用 lazyUpdate：首绘依赖 rAF，窗口被遮挡节流时图表会永远停留在空容器
    chartRef.current?.setOption(option, { notMerge: false });
  }, [option]);

  return <div ref={ref} className={`echart ${className}`} style={{ height }} />;
}

const KIND_ICONS: Record<DeviceKind, LucideIcon> = {
  weather: CloudSun,
  water: Waves,
  soil: Sprout,
  geology: Mountain,
  air: Wind,
  video: Video,
  drone: Plane,
  ugv: Truck,
  usv: Ship,
  satellite: Satellite,
  gateway: Router,
};

export function DeviceIcon({ kind, size = 16 }: { kind: DeviceKind; size?: number }) {
  const Icon = KIND_ICONS[kind] ?? Cpu;
  return <Icon size={size} strokeWidth={1.7} />;
}

export function Trend({ value, suffix = '' }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={`trend ${up ? 'trend--up' : 'trend--down'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}
      {value}
      {suffix}
    </span>
  );
}

export function EventIcon({ type }: { type: SimEvent['type'] }) {
  const map = {
    data: { icon: Activity, className: 'event-icon--data' },
    alert: { icon: AlertTriangle, className: 'event-icon--alert' },
    task: { icon: Gauge, className: 'event-icon--task' },
    ai: { icon: BrainCircuit, className: 'event-icon--ai' },
  };
  const item = map[type];
  const Icon = item.icon;
  return (
    <span className={`event-icon ${item.className}`}>
      <Icon size={12} />
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
