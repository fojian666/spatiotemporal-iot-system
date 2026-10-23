import { useState, type FormEvent } from 'react';
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
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../services/api';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const secure = API_BASE.startsWith('https://') || window.location.protocol === 'https:';
  const apiHost = API_BASE.replace(/^https?:\/\//, '');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
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

          <div className="auth-orbit" aria-hidden="true">
            <span className="auth-orbit__ring auth-orbit__ring--outer" />
            <span className="auth-orbit__ring auth-orbit__ring--inner" />
            <span className="auth-orbit__dot auth-orbit__dot--one" />
            <span className="auth-orbit__dot auth-orbit__dot--two" />
            <span className="auth-orbit__core"><LockKeyhole size={18} /></span>
            <em>403 / 401 GUARDED</em>
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
                  disabled={loading}
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
                  disabled={loading}
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

            <button type="submit" className="btn btn--primary auth-submit" disabled={loading}>
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
