import { DEVICES } from '../data/devices';
import { SCENARIOS, type ScenarioKey } from '../data/scenarios';
import type { AlertItem } from '../engine/simulation';

export const INVESTIGATION_KEY = 'stiot-investigation-v1';
export const INVESTIGATION_STEPS = ['map', 'telemetry', 'copilot'] as const;
export type InvestigationStep = typeof INVESTIGATION_STEPS[number];
export type InvestigationWindow = 30 | 60 | 120;
export interface Investigation {
  id: string;
  alertId: string;
  title: string;
  alertTime: string;
  deviceId: string;
  scenarioKey: ScenarioKey;
  referenceAt: number;
  minutes: InvestigationWindow;
  origin: string;
  visited: Partial<Record<InvestigationStep, string>>;
}

export function beginInvestigation(alert: AlertItem, scenarioKey: ScenarioKey, referenceAt: number, search = ''): Investigation | null {
  if (!DEVICES.some(device => device.id === alert.source) || !Number.isFinite(referenceAt)) return null;
  const query = new URLSearchParams(search);
  query.set('alert', alert.id);
  return { id: `${alert.id}:${referenceAt}`, alertId: alert.id, title: alert.title, alertTime: alert.time, deviceId: alert.source,
    scenarioKey, referenceAt, minutes: 30, origin: `/?${query}`, visited: {} };
}

export function investigationTarget(investigation: Investigation, step: InvestigationStep): string {
  return investigation.visited[step] ?? (step === 'map' ? `/map?focus=${investigation.deviceId}`
    : step === 'telemetry' ? `/simulation?focus=${investigation.deviceId}`
    : `/copilot?q=${encodeURIComponent(`${investigation.deviceId}当前状态如何？`)}`);
}

const STEP_PATH = { map: '/map', telemetry: '/simulation', copilot: '/copilot' };
export function isInvestigationTarget(step: InvestigationStep, path: unknown): path is string {
  if (typeof path !== 'string' || path.length > 2000) return false;
  return path.split('?')[0] === STEP_PATH[step] && !path.includes('#');
}

/** Store navigation metadata only; conversations stay in memory and are never serialized. */
export function restoreInvestigation(raw: string | null, owner: string): Investigation | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (saved?.owner !== owner) return null;
    const item = saved.investigation;
    if (!item || typeof item.id !== 'string' || typeof item.alertId !== 'string' || typeof item.title !== 'string' || typeof item.alertTime !== 'string' || item.alertTime.length > 40
      || item.id.length > 160 || item.alertId.length > 100 || item.title.length > 200
      || !DEVICES.some(device => device.id === item.deviceId)
      || typeof item.scenarioKey !== 'string' || !Object.prototype.hasOwnProperty.call(SCENARIOS, item.scenarioKey)
      || !Number.isFinite(item.referenceAt) || item.referenceAt < 0 || item.referenceAt > 8640000000000000
      || ![30, 60, 120].includes(item.minutes)
      || typeof item.origin !== 'string' || !item.origin.startsWith('/?') || item.origin.length > 2000
      || item.origin.includes('#') || new URLSearchParams(item.origin.slice(2)).get('alert') !== item.alertId
      || !item.visited || typeof item.visited !== 'object') return null;
    const visited: Investigation['visited'] = {};
    for (const step of INVESTIGATION_STEPS) {
      if (item.visited[step] !== undefined) {
        if (!isInvestigationTarget(step, item.visited[step])) return null;
        visited[step] = item.visited[step];
      }
    }
    return { id: item.id, alertId: item.alertId, title: item.title, alertTime: item.alertTime, deviceId: item.deviceId,
      scenarioKey: item.scenarioKey, referenceAt: item.referenceAt, minutes: item.minutes, origin: item.origin, visited };
  } catch { return null; }
}

export function investigationTimeRange(item: Investigation): string {
  const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${formatter.format(item.referenceAt - item.minutes * 60000)} — ${formatter.format(item.referenceAt)}`;
}
