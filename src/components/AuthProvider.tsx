import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AUTH_EXPIRED_EVENT,
  REMOTE_ENABLED,
  fetchMe,
  loginRequest,
  logoutRequest,
  type AuthUser,
} from '../services/api';
import { clearAuthToken, getAuthToken, setAuthToken } from '../services/authToken';
import { AuthContext, useAuth, type AuthContextValue, type AuthStatus } from '../auth/AuthContext';
import { BootSplash } from './BootSplash';
import { LoginPage } from '../pages/Login';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
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
    fetchMe()
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthToken();
        setUser(null);
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const logout = useCallback(() => {
    void logoutRequest().catch(() => undefined);
    clearAuthToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isRemote: REMOTE_ENABLED,
      canOperate: !REMOTE_ENABLED || user?.role === 'admin' || user?.role === 'operator',
      login,
      logout,
    }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (!REMOTE_ENABLED) return <>{children}</>;
  if (status === 'checking') {
    return <BootSplash title="正在验证安全会话" detail="JWT · TLS · SESSION CHECK" />;
  }
  if (status === 'anonymous') return <LoginPage />;
  return <>{children}</>;
}
