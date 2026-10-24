import { createContext, useContext } from 'react';
import type { AuthUser, UserRole } from '../services/api';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated' | 'error';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isRemote: boolean;
  canOperate: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithRole: (role: UserRole) => Promise<void>;
  logout: () => void;
  retrySession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
