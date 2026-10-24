import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const KEY = 'stiot-theme';

let current: Theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
const listeners = new Set<() => void>();

function getSnapshot(): Theme {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type ViewTransitionCapableDocument = Document & {
  startViewTransition?: (callback: () => void) => unknown;
};

export function setTheme(theme: Theme): void {
  const apply = () => {
    current = theme;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      // storage may be blocked in hardened contexts
    }
    listeners.forEach((listener) => listener());
  };
  const doc = document as ViewTransitionCapableDocument;
  if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      doc.startViewTransition(apply);
      return;
    } catch {
      // fall through to the instant switch
    }
  }
  apply();
}

export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export interface ChartPalette {
  label: string;
  labelStrong: string;
  labelDim: string;
  dim: string;
  grid: string;
  axisLine: string;
  halo: string;
  nodeSelect: string;
  tipBg: string;
  tipBorder: string;
  tipText: string;
}

/** Read chart text colors from the active theme's CSS tokens. */
export function chartPalette(): ChartPalette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    label: read('--chart-label', '#8aa7c2'),
    labelStrong: read('--chart-label-strong', '#d6ebff'),
    labelDim: read('--chart-label-dim', 'rgba(186,213,238,.28)'),
    dim: read('--chart-dim', '#587792'),
    grid: read('--chart-grid', 'rgba(120,170,220,.08)'),
    axisLine: read('--chart-axis-line', 'rgba(120,170,220,.14)'),
    halo: read('--chart-halo', '#040a12'),
    nodeSelect: read('--node-select', '#ffffff'),
    tipBg: read('--chart-tip-bg', 'rgba(5,14,26,.96)'),
    tipBorder: read('--chart-tip-border', 'rgba(90,180,255,.22)'),
    tipText: read('--chart-tip-text', '#dcecff'),
  };
}

/** Darken a hex color toward black by the given factor (0-1). */
export function darkenHex(hex: string, factor: number): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const channels = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(m.slice(i, i + 2), 16) * factor))));
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
