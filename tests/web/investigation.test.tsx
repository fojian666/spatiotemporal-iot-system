import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AlertItem } from '../../src/engine/simulation';
import { beginInvestigation, investigationTarget, investigationTimeRange, restoreInvestigation, INVESTIGATION_KEY } from '../../src/investigation/state';
import { InvestigationProvider, useInvestigation } from '../../src/investigation/InvestigationProvider';

vi.mock('../../src/auth/AuthContext', () => ({ useAuth: () => ({ user: null, isRemote: false }) }));
const alert: AlertItem = { id: 'normal-1', source: 'WQ-04', title: '水质异常', level: 'warning', zone: '测试区', time: '00:10', detail: '复核', status: '待处置' };
const reference = Date.parse('2026-10-27T00:10:00+08:00');
const create = () => beginInvestigation(alert, 'normal', reference, 'search=water')!;
const wrapper = ({ children }: { children: ReactNode }) => <InvestigationProvider>{children}</InvestigationProvider>;

it('records a fixed reference window and original alert query without changing live data', () => {
  const item = create();
  expect(item.alertTime).toBe('00:10');
  expect(item.origin).toBe('/?search=water&alert=normal-1');
  expect(investigationTarget(item, 'map')).toBe('/map?focus=WQ-04');
  expect(investigationTarget(item, 'copilot')).toContain('/copilot?q=');
  expect(investigationTimeRange(item)).toBe('10/26 23:40 — 10/27 00:10');
  expect(beginInvestigation({ ...alert, source: 'unknown' }, 'normal', reference)).toBeNull();
});

it('restores only valid owner-scoped navigation metadata', () => {
  const item = create();
  const serialize = (value: unknown, owner = 'local') => JSON.stringify({ owner, investigation: value });
  expect(restoreInvestigation(serialize(item), 'local')).toEqual(item);
  expect(restoreInvestigation(serialize(item), 'api:viewer')).toBeNull();
  for (const patch of [{ minutes: 1 }, { deviceId: 'unknown' }, { scenarioKey: '__proto__' }, { referenceAt: -1 }, { origin: '/?alert=wrong' }, { visited: { map: '//external.test' } }, { visited: { telemetry: '/copilot?q=x' } }]) {
    expect(restoreInvestigation(serialize({ ...item, ...patch }), 'local')).toBeNull();
  }
  expect(restoreInvestigation('{', 'local')).toBeNull();
});

it('keeps filters for the case device, resets new cases, bounds chat and clears on end', () => {
  const { result } = renderHook(useInvestigation, { wrapper });
  act(() => result.current.begin(alert, 'normal', reference));
  act(() => result.current.recordView('telemetry', 'WQ-01', '/simulation?focus=WQ-01', 'normal'));
  expect(result.current.investigation?.visited).toEqual({});
  act(() => result.current.recordView('map', 'WQ-04', '/map?focus=WQ-04', 'storm'));
  expect(result.current.investigation?.visited).toEqual({});
  act(() => result.current.recordView('telemetry', 'WQ-04', '/simulation?focus=WQ-04&search=water&chart=water', 'normal'));
  expect(investigationTarget(result.current.investigation!, 'telemetry')).toContain('search=water');
  act(() => result.current.setWindow(60));
  act(() => result.current.begin(alert, 'normal', reference + 1000));
  expect(result.current.investigation?.minutes).toBe(60);
  const chat = { messages: Array.from({ length: 45 }, (_, i) => ({ id: String(i), role: 'user' as const, text: '私有对话', time: '12:00', animate: true })), draft: '草稿', initialQuery: null, scrollTop: 20 };
  act(() => result.current.saveChat(result.current.investigation!.id, chat));
  expect(result.current.readChat()?.messages).toHaveLength(40);
  expect(result.current.readChat()?.messages[0].animate).toBe(false);
  expect(sessionStorage.getItem(INVESTIGATION_KEY)).not.toContain('私有对话');
  act(() => result.current.begin({ ...alert, id: 'normal-2' }, 'normal', reference));
  expect(result.current.readChat()).toBeNull();
  expect(result.current.investigation?.visited).toEqual({});
  act(() => result.current.saveChat('old-case', chat));
  expect(result.current.readChat()).toBeNull();
  act(() => result.current.end());
  expect(sessionStorage.getItem(INVESTIGATION_KEY)).toBeNull();
});

it('continues in memory if session storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const { result } = renderHook(useInvestigation, { wrapper });
  act(() => result.current.begin(alert, 'normal', reference));
  expect(result.current.investigation?.deviceId).toBe('WQ-04');
});
