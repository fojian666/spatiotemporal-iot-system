import { useSyncExternalStore } from 'react';

const KEY = 'stiot-reduce-motion';
const system = window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set<() => void>();
let manual = false;
try { manual = window.localStorage.getItem(KEY) === '1'; } catch { /* storage may be blocked */ }

export function prefersReducedMotion(): boolean { return manual || system.matches; }

function publish() {
  document.documentElement.dataset.motion = prefersReducedMotion() ? 'reduced' : 'full';
  listeners.forEach((listener) => listener());
}
system.addEventListener('change', publish);
publish();

// 暂停隐藏标签页里的装饰动画；数据订阅与仿真时钟继续运行。
function syncVisibility() {
  document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
}
document.addEventListener('visibilitychange', syncVisibility);
syncVisibility();

export function subscribeMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, prefersReducedMotion);
}
export function toggleMotion(): void {
  // 系统降级优先，页面内开关不能绕过系统设置。
  manual = !prefersReducedMotion();
  try { window.localStorage.setItem(KEY, manual ? '1' : '0'); } catch { /* optional preference */ }
  publish();
}
export function systemReducesMotion(): boolean { return system.matches; }
