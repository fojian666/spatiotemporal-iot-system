import type { CSSProperties } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Database,
  Fingerprint,
  FlaskConical,
  LayoutDashboard,
  Map as MapIcon,
  Network,
  Plane,
  RadioTower,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { AtomVisual } from '../components/AtomVisual';
import { useAuth } from '../auth/AuthContext';
import type { UserRole } from '../services/api';

const MODULES: { path: string; title: string; en: string; desc: string; icon: LucideIcon }[] = [
  { path: '/', title: '态势总览', en: 'OVERVIEW', desc: '区域 KPI、多源趋势、告警流转与智能体建议', icon: LayoutDashboard },
  { path: '/drone', title: '一网统飞', en: 'DRONE OPS', desc: '机场、航线、任务计划与实时飞控', icon: Plane },
  { path: '/map', title: '时空一张图', en: 'GEO MAP', desc: '卫星底图、感知设备、航线与电子围栏', icon: MapIcon },
  { path: '/graph', title: '知识图谱', en: 'KNOWLEDGE', desc: '可检索、可推理的时空语义网络', icon: Network },
  { path: '/simulation', title: '物联仿真', en: 'SIMULATION', desc: '四类场景注入与九组环境参数驱动', icon: FlaskConical },
  { path: '/copilot', title: '物联大模型', en: 'COPILOT', desc: '意图识别、证据链引用与场景联动', icon: Bot },
  { path: '/platform', title: '文档中心', en: 'DOCS', desc: '六组二十三篇文档，开卷式阅读', icon: BookOpen },
];

const STATS = [
  { value: '21', unit: '个', label: '感知节点' },
  { value: '5', unit: '套', label: '无人系统' },
  { value: '56 / 126', unit: '', label: '实体 / 关系' },
  { value: '7', unit: '个', label: '一级模块' },
];

const STACK = [
  { icon: Fingerprint, label: 'JWT 会话' },
  { icon: ShieldCheck, label: 'RBAC 三角色' },
  { icon: RadioTower, label: 'MQTT over TLS' },
  { icon: Database, label: 'PostgreSQL · PostGIS' },
];

const ROLE_LABEL: Record<UserRole, string> = {
  admin: '管理员',
  operator: '值班长',
  viewer: '观察员',
};

export function WelcomePage({ onEnter }: { onEnter: (path: string) => void }) {
  const { user, isRemote } = useAuth();
  const session = isRemote && user ? `${user.displayName} · ${ROLE_LABEL[user.role]}` : '本地演示 · 免登录';

  const scrollToModules = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('welcome-modules')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="welcome-screen">
      <div className="auth-aurora auth-aurora--one" />
      <div className="auth-aurora auth-aurora--two" />
      <div className="auth-grid" aria-hidden="true" />

      <header className="welcome-top">
        <div className="welcome-brand">
          <div className="auth-brand__mark" aria-hidden="true"><Network size={21} strokeWidth={1.7} /></div>
          <div>
            <strong>时空智能物联网系统</strong>
            <span>PING'AN · SPATIOTEMPORAL IOT</span>
          </div>
        </div>
        <div className="welcome-top__aside">
          <span className="welcome-session mono">
            <i aria-hidden="true" />
            <span className="welcome-session__label">
              {isRemote && user ? 'SESSION VERIFIED · ' : 'LOCAL DEMO · '}
            </span>
            {session}
          </span>
          <button type="button" className="btn btn--sm btn--ghost welcome-top__enter" onClick={() => onEnter('/')}>
            进入操作台 <ArrowRight size={13} />
          </button>
        </div>
      </header>

      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="welcome-hero__text">
            <span className="overline">WHERE THE RIVER MEETS THE SKY</span>
            <h1>山河入网<br /><em>时空为证</em></h1>
            <p>
              低空之翼、湟水之脉与无人系统于此汇流。一个入口，看见二十一个感知节点的呼吸、五套无人系统的巡行，
              以及一张可检索、可推理的时空知识网络。
            </p>
            <div className="welcome-hero__actions">
              <button type="button" className="btn btn--primary" onClick={() => onEnter('/')}>
                进入操作台 <ArrowRight size={15} />
              </button>
              <button type="button" className="btn btn--ghost" onClick={scrollToModules}>
                浏览模块
              </button>
            </div>
            <dl className="welcome-stats">
              {STATS.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd className="mono">{item.value}<em>{item.unit}</em></dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="welcome-hero__visual">
            <AtomVisual caption="核守于中 · 电子巡于外" />
          </div>
        </section>

        <section id="welcome-modules" className="welcome-modules">
          <header className="welcome-section-head">
            <span className="overline">SEVEN MODULES · ONE CONSOLE</span>
            <h2>七个模块，一处瞭望</h2>
            <p>
              从感知接入到无人系统调度，从一张图到可推理的知识网络。身份已核验，选择任一模块即可直接进入。
            </p>
          </header>
          <div className="welcome-module-grid">
            {MODULES.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  className="welcome-card"
                  aria-label={`${item.title}：${item.desc}`}
                  style={{ '--i': index } as CSSProperties}
                  onClick={() => onEnter(item.path)}
                >
                  <span className="welcome-card__index mono" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <span className="welcome-card__icon" aria-hidden="true"><Icon size={17} strokeWidth={1.7} /></span>
                  <span className="welcome-card__title" aria-hidden="true">
                    {item.title}
                    <em className="mono">{item.en}</em>
                  </span>
                  <span className="welcome-card__desc" aria-hidden="true">{item.desc}</span>
                  <span className="welcome-card__arrow" aria-hidden="true"><ArrowRight size={14} /></span>
                </button>
              );
            })}
            <article className="welcome-card welcome-card--note">
              <span className="welcome-card__index mono" aria-hidden="true">NOTE</span>
              <span className="welcome-card__title">演示与真实</span>
              <span className="welcome-card__desc">
                遥测数值由仿真合成，视频为静态影像叠加检测框，物联大模型为本地规则引擎；
                而 MQTT/TLS → FastAPI → PostGIS → WebSocket 的管道与 JWT / RBAC 鉴权是真实实现的。
              </span>
            </article>
          </div>
        </section>

        <section className="welcome-stack">
          <header className="welcome-section-head">
            <span className="overline">SECURE, OBSERVABLE, REPRODUCIBLE</span>
            <h2>可信的底座</h2>
          </header>
          <div className="welcome-stack__chips">
            {STACK.map((item) => {
              const Icon = item.icon;
              return (
                <span key={item.label} className="welcome-chip">
                  <Icon size={13} />
                  {item.label}
                </span>
              );
            })}
            <span className="welcome-chip">MapLibre GL</span>
            <span className="welcome-chip">ECharts</span>
          </div>
        </section>

        <footer className="welcome-foot">
          <span className="mono">ST-IOT · 平安区湟水河流域 · DEMONSTRATION PLATFORM</span>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => onEnter('/')}>
            进入操作台 <ArrowRight size={13} />
          </button>
        </footer>
      </main>
    </div>
  );
}
