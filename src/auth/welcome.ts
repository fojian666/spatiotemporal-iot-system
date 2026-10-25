const WELCOME_SEEN_KEY = 'stiot-welcome-seen';

export function hasSeenWelcome(): boolean {
  try {
    return window.sessionStorage.getItem(WELCOME_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    window.sessionStorage.setItem(WELCOME_SEEN_KEY, '1');
  } catch {
    // storage blocked
  }
}

// 用 replace 而不是 push：欢迎页 CTA 不留下多余的历史记录，同时手动通知哈希路由。
export function navigateReplacingHash(path: string): void {
  const next = `#${path}`;
  if (window.location.hash === next) return;
  window.history.replaceState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
