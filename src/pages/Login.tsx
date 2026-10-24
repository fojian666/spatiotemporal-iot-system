import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Orbit,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE, fetchDemoRoles, type DemoRoleInfo, type UserRole } from '../services/api';

const ROLE_META: Record<UserRole, { label: string; note: string; icon: typeof ShieldCheck }> = {
  admin: { label: '管理员', note: '全部权限', icon: ShieldCheck },
  operator: { label: '值班长', note: '飞控与处置', icon: UserRound },
  viewer: { label: '观察员', note: '只读查询', icon: Eye },
};

export function LoginPage() {
  const { login, loginWithRole } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoRoles, setDemoRoles] = useState<DemoRoleInfo[]>([]);
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const atomRef = useRef<HTMLDivElement | null>(null);
  const secure = API_BASE.startsWith('https://') || window.location.protocol === 'https:';
  const apiHost = API_BASE.replace(/^https?:\/\//, '');
  const busy = loading || pendingRole !== null;

  const handleAtomMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const node = atomRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty('--atom-tilt-x', `${(-y * 7).toFixed(2)}deg`);
    node.style.setProperty('--atom-tilt-y', `${(x * 9).toFixed(2)}deg`);
  };

  const resetAtom = () => {
    const node = atomRef.current;
    if (!node) return;
    node.style.setProperty('--atom-tilt-x', '0deg');
    node.style.setProperty('--atom-tilt-y', '0deg');
  };

  const handleAtomOut = (event: ReactPointerEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    resetAtom();
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchDemoRoles(controller.signal)
      .then((payload) => {
        if (payload.enabled) setDemoRoles(payload.roles);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleLogin = async (role: UserRole) => {
    if (busy) return;
    setError('');
    setPendingRole(role);
    try {
      await loginWithRole(role);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '演示登录失败，请稍后重试');
    } finally {
      setPendingRole(null);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-aurora auth-aurora--one" />
      <div className="auth-aurora auth-aurora--two" />
      <div className="auth-grid" aria-hidden="true" />

      <header className="auth-brand">
        <div className="auth-brand__mark"><Orbit size={21} /></div>
        <div>
          <strong>时空智能物联网系统</strong>
          <span>PING'AN · SPATIOTEMPORAL IOT</span>
        </div>
      </header>

      <main className="auth-card">
        <section className="auth-visual">
          <span className="overline">AUTHORIZED OPERATIONS CONSOLE</span>
          <h1>接入时空智能<br /><em>可信操作台</em></h1>
          <p>面向低空感知、河流监测与无人系统的统一操作入口。身份、会话与设备链路由 JWT、角色权限与 MQTT ACL 保护。</p>

          <div className="auth-protocols">
            <span><Fingerprint size={13} /> JWT 会话</span>
            <span><ShieldCheck size={13} /> RBAC 权限</span>
            <span><RadioTower size={13} /> MQTT ACL</span>
            <span><Database size={13} /> PostGIS</span>
          </div>

          <div
            className="auth-atom"
            ref={atomRef}
            onPointerMove={handleAtomMove}
            onPointerOut={handleAtomOut}
            onPointerLeave={resetAtom}
            onPointerCancel={resetAtom}
            aria-hidden="true"
          >
            <div className="auth-atom__stage">
              <div className="auth-atom__cage">
                <span className="auth-atom__orbit auth-atom__orbit--a">
                  <i className="auth-atom__ring" />
                  <span className="auth-atom__shell">
                    <i className="auth-atom__trail" />
                    <i className="auth-atom__electron" />
                  </span>
                </span>
                <span className="auth-atom__orbit auth-atom__orbit--b">
                  <i className="auth-atom__ring" />
                  <span className="auth-atom__shell">
                    <i className="auth-atom__trail" />
                    <i className="auth-atom__electron" />
                  </span>
                  <span className="auth-atom__shell auth-atom__shell--lag">
                    <i className="auth-atom__trail" />
                    <i className="auth-atom__electron" />
                  </span>
                </span>
                <span className="auth-atom__orbit auth-atom__orbit--c">
                  <i className="auth-atom__ring" />
                  <span className="auth-atom__shell">
                    <i className="auth-atom__trail" />
                    <i className="auth-atom__electron" />
                  </span>
                </span>
                <span className="auth-atom__core">
                  <i className="auth-atom__nucleon" />
                  <i className="auth-atom__nucleon" />
                  <i className="auth-atom__nucleon" />
                  <i className="auth-atom__nucleon" />
                  <i className="auth-atom__nucleon" />
                  <i className="auth-atom__nucleon" />
                </span>
              </div>
            </div>
            <em>3 SHELLS · 4 ELECTRONS</em>
          </div>

          <div className="auth-endpoint mono">
            <span className={secure ? 'is-secure' : 'is-warning'} />
            {secure ? 'TLS CHANNEL ACTIVE' : 'LOCAL HTTP · DEMO MODE'}
            <em>{apiHost}</em>
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-head">
            <span className="overline">IDENTITY VERIFICATION</span>
            <h2>登录操作台</h2>
            <p>使用已分配的账号继续。观察员为只读角色。</p>
          </div>

          {demoRoles.length > 0 && (
            <div className="auth-demo">
              <div className="auth-demo__head">
                <span className="overline">DEMO QUICK ACCESS</span>
                <span>一键进入演示角色</span>
              </div>
              <div className="auth-demo__grid">
                {demoRoles.map((item) => {
                  const meta = ROLE_META[item.role];
                  const Icon = meta.icon;
                  const pending = pendingRole === item.role;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      className={`auth-demo__btn ${pending ? 'is-pending' : ''}`}
                      disabled={busy}
                      title={`${item.displayName} · ${meta.note}`}
                      aria-label={`以${meta.label}身份登录`}
                      onClick={() => void handleRoleLogin(item.role)}
                    >
                      <span className="auth-demo__icon"><Icon size={15} /></span>
                      <span className="auth-demo__text"><strong>{meta.label}</strong><em>{item.username}</em></span>
                      {pending ? <RefreshCw size={13} className="is-spinning" /> : <ArrowRight size={13} />}
                    </button>
                  );
                })}
              </div>
              <p className="auth-demo__hint">账号由服务端配置；点击直接签发对应角色会话，密码不会下发到浏览器。</p>
              <div className="auth-divider"><span>或使用账号密码登录</span></div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>账号</span>
              <div className="auth-input">
                <UserRound size={15} />
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="输入账号"
                  autoComplete="username"
                  autoFocus
                  disabled={busy}
                />
              </div>
            </label>

            <label className="auth-field">
              <span>密码</span>
              <div className="auth-input">
                <LockKeyhole size={15} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  autoComplete="current-password"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-eye"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            {error && (
              <div className="auth-error" role="alert">
                <AlertTriangle size={13} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn btn--primary auth-submit" disabled={busy} data-loading={loading ? 'true' : undefined}>
              {loading ? '正在验证…' : '进入系统'}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <div className="auth-footnote">
            <LockKeyhole size={12} />
            <span>本地演示环境 · 会话仅保存在当前标签页</span>
          </div>
        </section>
      </main>

      <footer className="auth-footer mono">
        <span>ONLINE GUARD · 21 NODES · 5 UNMANNED ASSETS</span>
        <span>FASTAPI / POSTGIS / MQTT / JWT</span>
      </footer>
    </div>
  );
}
