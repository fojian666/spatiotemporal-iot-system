import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  REMOTE_ENABLED,
  demoLoginRequest,
  fetchMe,
  loginRequest,
  logoutRequest,
  type AuthUser,
  type UserRole,
} from '../services/api';
import { clearAuthToken, getAuthToken, setAuthToken } from '../services/authToken';
import { AuthContext, useAuth, type AuthContextValue, type AuthStatus } from '../auth/AuthContext';
import { BootSplash } from './BootSplash';
import { LoginPage } from '../pages/Login';
import { WelcomePage } from '../pages/Welcome';
import { hasSeenWelcome, markWelcomeSeen, navigateReplacingHash } from '../auth/welcome';

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<AuthStatus>(() => {
    if (!REMOTE_ENABLED) return 'authenticated';
    return getAuthToken() ? 'checking' : 'anonymous';
  });

  useEffect(() => {
    if (!REMOTE_ENABLED) return undefined;
    if (!getAuthToken()) {
      setStatus('anonymous');
      return undefined;
    }
    let cancelled = false;
    setStatus('checking');
    fetchMe()
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        setStatus('authenticated');
      })
      .catch((reason) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 401) {
          clearAuthToken();
          setUser(null);
          setStatus('anonymous');
          return;
        }
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const handleExpired = () => {
      clearAuthToken();
      setUser(null);
      setStatus('anonymous');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await loginRequest(username, password);
    setAuthToken(response.access_token);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const loginWithRole = useCallback(async (role: UserRole) => {
    const response = await demoLoginRequest(role);
    setAuthToken(response.access_token);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(() => {
    void logoutRequest().catch(() => undefined);
    clearAuthToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const retrySession = useCallback(() => {
    setStatus('checking');
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isRemote: REMOTE_ENABLED,
      canOperate: !REMOTE_ENABLED || user?.role === 'admin' || user?.role === 'operator',
      login,
      loginWithRole,
      logout,
      retrySession,
    }),
    [user, status, login, loginWithRole, logout, retrySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, retrySession } = useAuth();
  const hash = useHashRoute();
  const [welcomeSeen, setWelcomeSeen] = useState(hasSeenWelcome);

  const enter = useCallback((path: string) => {
    markWelcomeSeen();
    setWelcomeSeen(true);
    navigateReplacingHash(path);
  }, []);

  // 未登录深链（如 #/drone）：欢迎页主按钮仍回到原目标，而不是丢掉
  const pendingPath = hash.startsWith('#/') && hash !== '#/welcome' ? hash.slice(1) : '/';
  const enterFromWelcome = useCallback(
    (path: string) => enter(path === '/' ? pendingPath : path),
    [enter, pendingPath],
  );

  if (hash.startsWith('#/welcome')) return <WelcomePage onEnter={enterFromWelcome} />;
  if (!REMOTE_ENABLED) return <>{children}</>;
  if (status === 'checking') {
    return <BootSplash title="正在验证安全会话" detail="JWT · SESSION CHECK" />;
  }
  if (status === 'error') {
    return (
      <div className="boot-splash">
        <div className="boot-splash__mark">
          <span />
          <span />
          <span />
        </div>
        <span className="overline">SESSION CHECK FAILED</span>
        <strong>无法验证登录会话</strong>
        <p>服务端暂时不可达，本地会话未被清除。请确认后端已启动后重试。</p>
        <button type="button" className="btn btn--primary" onClick={retrySession}>
          重新验证
        </button>
      </div>
    );
  }
  if (status === 'anonymous') {
    return welcomeSeen ? <LoginPage /> : <WelcomePage onEnter={enterFromWelcome} />;
  }
  return <>{children}</>;
}
