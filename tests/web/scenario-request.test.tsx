import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useScenarioRequest } from '../../src/hooks/useScenarioRequest';
import { useSimulation, type SimContextValue } from '../../src/engine/simulation';
vi.mock('../../src/engine/simulation', () => ({ useSimulation: vi.fn() }));

it('locks synchronous double submissions, reports rejection and permits retry', async () => {
  let finish!: (ok: boolean) => void;
  const setScenario = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  vi.mocked(useSimulation).mockReturnValue({ setScenario } as unknown as SimContextValue);
  const { result } = renderHook(useScenarioRequest);
  let first!: Promise<void>;
  act(() => { first = result.current.request('storm'); void result.current.request('fire'); });
  expect(setScenario).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBe(true);
  await act(async () => { finish(false); await first; });
  expect(result.current.error).toBe('场景切换失败，请重试。');
  expect(result.current.pending).toBe(false);
  act(() => { first = result.current.request('storm'); });
  expect(result.current.error).toBe('');
  await act(async () => { finish(true); await first; });
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toBe('');
  expect(setScenario).toHaveBeenCalledTimes(2);
});
