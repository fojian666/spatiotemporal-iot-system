import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  Boxes,
  Clock3,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Moon,
  Network,
  Plane,
  RadioTower,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { formatSimTime, useSimulation } from '../engine/simulation';
import { ArchitectureModal, useArchitectureModal } from './ArchitectureModal';
import { StatusPill } from './ui';

const NAV = [
  { path: '/', label: '态势总览', en: 'OVERVIEW', icon: LayoutDashboard },
  { path: '/drone', label: '一网统飞', en: 'DRONE OPS', icon: Plane },
  { path: '/platform', label: '文档中心', en: 'DOCS', icon: BookOpen },
  { path: '/simulation', label: '物联仿真', en: 'SIMULATION', icon: FlaskConical },
  { path: '/map', label: '时空一张图', en: 'GEO MAP', icon: MapIcon },
  { path: '/graph', label: '知识图谱', en: 'KNOWLEDGE', icon: Network },
  { path: '/copilot', label: '物联大模型', en: 'COPILOT', icon: Bot },
];

const TITLES: Record<string, string> = {
  '/': '态势总览',
  '/drone': '一网统飞',
  '/platform': '文档中心',
  '/simulation': '物联仿真',
  '/map': '时空一张图',
  '/graph': '知识图谱',
  '/copilot': '物联大模型',
};

function Logo() {
  return (
    <div className="brand">
      <svg viewBox="0 0 44 44" className="brand__mark" aria-hidden="true">
        <defs>
          <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6ef3ff" />
            <stop offset="1" stopColor="#2d8cff" />
          </linearGradient>
        </defs>
        <path d="M22 3.5 38 12v20L22 40.5 6 32V12Z" fill="none" stroke="url(#brandGrad)" strokeWidth="1.2" opacity=".85" />
        <path d="M22 10.5 31.5 16v11L22 32.5 12.5 27V16Z" fill="rgba(75,225,255,.08)" stroke="rgba(75,225,255,.35)" strokeWidth=".8" />
        <circle cx="22" cy="21.5" r="3.2" fill="#6ef3ff" />
        <circle cx="22" cy="21.5" r="7.5" fill="none" stroke="rgba(110,243,255,.4)" strokeWidth=".7" strokeDasharray="2 3" />
        <circle cx="22" cy="4.5" r="1.4" fill="#6ef3ff" />
        <circle cx="38" cy="27" r="1.1" fill="#23e6b0" />
        <circle cx="6.5" cy="14" r="1.1" fill="#7aa2ff" />
      </svg>
      <span className="brand__text">时空智能</span>
    </div>
  );
}

const THEME_KEY = 'stiot-theme';
type Theme = 'dark' | 'light';

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // hardened browser contexts may block storage
    }
  };
  return { theme, toggle };
}

export function Shell({ children }: { children: ReactNode }) {
  const { simTime, scenario, running, speed, stats, source, linkStatus } = useSimulation();
  const { user, logout, isRemote } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const roleLabel = user?.role === 'admin' ? '管理员' : user?.role === 'operator' ? '值班长' : user?.role === 'viewer' ? '观察员（只读）' : '本地演示';
  const displayName = user?.displayName ?? '值班长';
  const avatarText = user ? user.displayName.slice(0, 2) : 'LOCAL';
  const time = formatSimTime(simTime);
  const location = useLocation();
  const { open, openModal, closeModal } = useArchitectureModal();
  const isFlush = location.pathname === '/map';

  return (
    <div className="app-shell" style={{ '--scenario-color': scenario.color } as CSSProperties}>
      <aside className="rail">
        <Logo />
        <nav className="rail__nav" aria-label="主导航">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `rail__item ${isActive ? 'is-active' : ''}`}
                title={item.label}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="rail__foot">
          <div className="rail__pulse">
            <i />
            DEMO
          </div>
          <span className="rail__version mono">v1.0.0</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__crumb">
            <span className="topbar__system">平安区 · 时空智能物联网系统</span>
            <span className="topbar__divider" />
            <span className="topbar__page">{TITLES[location.pathname] ?? '系统'}</span>
          </div>

          <div className="topbar__right">
            <div className="topbar__clock">
              <Clock3 size={14} />
              <span className="mono topbar__time">{time.time}</span>
              <span className="topbar__date">{time.date.replaceAll('-', '.')} {time.weekday}</span>
            </div>

            <span className="scenario-pill" style={{ '--pill': scenario.color } as CSSProperties}>
              <i />
              {scenario.name}
            </span>

            <span
              className={`run-pill ${
                source === 'api'
                  ? linkStatus === 'live'
                    ? running ? 'is-running' : ''
                    : 'is-accelerated'
                  : running ? 'is-running' : ''
              } ${source === 'local' && speed > 1 ? 'is-accelerated' : ''}`}
            >
              <span className="run-pill__wave" />
              {source === 'api'
                ? linkStatus === 'live'
                  ? running ? 'API / MQTT · 实时' : 'API / MQTT · 暂停'
                  : linkStatus === 'connecting' ? 'API 连接中' : 'API 重连中'
                : running ? (speed === 1 ? '本地同步 · 1s' : `仿真加速 ×${speed}`) : '数据流暂停'}
            </span>

            <button
              type="button"
              className="arch-trigger"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换为白色主题' : '切换为暗色主题'}
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              {theme === 'dark' ? '白色主题' : '暗色主题'}
            </button>

            <button type="button" className="arch-trigger" onClick={openModal}>
              <Boxes size={15} />
              系统架构
            </button>

            <div className="topbar__status">
              <StatusPill tone="online" dot>{stats.onlineRate.toFixed(1)}% 在线</StatusPill>
              <div className="operator">
                <span className="operator__avatar">{avatarText}</span>
                <div>
                  <strong>{displayName}</strong>
                  <span>{roleLabel}{isRemote && user ? ` · ${user.username}` : ''}</span>
                </div>
                {isRemote && (
                  <button type="button" className="operator__logout" onClick={logout} title="退出登录" aria-label="退出登录">
                    <LogOut size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className={`app-content ${isFlush ? 'app-content--flush' : ''}`}>
          <div className="app-content__backdrop" aria-hidden="true">
            <div className="app-content__grid" />
            <div className="app-content__glow" />
          </div>
          {children}
        </main>
      </div>

      <ArchitectureModal open={open} onClose={closeModal} />
    </div>
  );
}

export function PageHeader({
  overline,
  title,
  description,
  actions,
  icon: Icon,
}: {
  overline: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <header className="page-header">
      <div className="page-header__icon">{Icon && <Icon size={20} />}</div>
      <div className="page-header__text">
        <span className="overline">{overline}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
