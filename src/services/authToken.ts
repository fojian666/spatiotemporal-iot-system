const TOKEN_KEY = 'iot_console_access_token';

export function getAuthToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Session storage can be unavailable in hardened browser contexts.
  }
}

export function clearAuthToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures.
  }
}
