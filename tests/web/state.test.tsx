import { act, render, renderHook, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SimulationProvider, useSimulation } from '../../src/engine/simulation';
import { usePageQuery } from '../../src/hooks/usePageQuery';
import { useAnimatedNumber } from '../../src/hooks/useAnimatedNumber';
import { useFocusTrap } from '../../src/hooks/useFocusTrap';
import { useRef } from 'react';
import { hasSeenWelcome, markWelcomeSeen, navigateReplacingHash } from '../../src/auth/welcome';

it('local clock pauses, accelerates, cycles alerts and cleans its interval', async () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(useSimulation, { wrapper: SimulationProvider });
  expect(result.current.source).toBe('local');
  expect(Object.keys(result.current.readings)).toHaveLength(21);
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.tick).toBe(1);
  act(() => result.current.setRunning(false));
  act(() => vi.advanceTimersByTime(5000));
  expect(result.current.tick).toBe(1);
  const before = result.current.simTime.getTime();
  act(() => { result.current.setSpeed(4); result.current.setRunning(true); });
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.simTime.getTime() - before).toBe(4000);
  await act(async () => { await result.current.setScenario('storm'); });
  expect(result.current.scenarioKey).toBe('storm');
  expect(result.current.alerts.some(a => a.level === 'critical')).toBe(true);
  const alert = result.current.alerts[0];
  for (let i = 0; i < 3; i++) await act(async () => { expect(await result.current.cycleAlert(alert.id)).toBe(true); });
  await act(async () => { expect(await result.current.cycleAlert('missing')).toBe(false); });
  expect(result.current.alerts[0].status).toBe(alert.status);
  expect(result.current.history.length).toBeLessThanOrEqual(36);
  expect(result.current.events.length).toBeLessThanOrEqual(8);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('filters replace the current history entry, preserve other fields and delete empty values', () => {
  const wrapper = ({ children }: any) => <MemoryRouter initialEntries={['/map?focus=WQ-04&asset=sensing']}>{children}</MemoryRouter>;
  const { result } = renderHook(() => ({ query: usePageQuery(), location: useLocation(), navigate: useNavigate() }), { wrapper });
  act(() => result.current.query[1]({ asset: 'video', search: 'test' }));
  expect(result.current.query[0].get('focus')).toBe('WQ-04');
  act(() => result.current.query[1]({ search: null }));
  expect(result.current.query[0].has('search')).toBe(false);
  act(() => result.current.navigate('/simulation?focus=WQ-04'));
  act(() => result.current.navigate(-1));
  expect(result.current.location.search).toBe('?focus=WQ-04&asset=video');
});

it('welcome stays tab-local and replacement navigation emits a router event', () => {
  expect(hasSeenWelcome()).toBe(false);
  markWelcomeSeen();
  expect(hasSeenWelcome()).toBe(true);
  const event = vi.fn();
  window.addEventListener('hashchange', event);
  navigateReplacingHash('/simulation?focus=WQ-04');
  expect(window.location.hash).toBe('#/simulation?focus=WQ-04');
  navigateReplacingHash('/simulation?focus=WQ-04');
  expect(event).toHaveBeenCalledTimes(1);
  window.removeEventListener('hashchange', event);
});

it('animated number ignores nonfinite values and supports immediate changes', () => {
  const { result, rerender } = renderHook(({ value }) => useAnimatedNumber(value, 0), { initialProps: { value: 10 } });
  rerender({ value: 20 });
  expect(result.current).toBe(20);
  rerender({ value: NaN });
  expect(result.current).toBe(20);
});

it('focus trap wraps both directions and restores previous focus', () => {
  const launcher = document.createElement('button');
  document.body.append(launcher);
  launcher.focus();
  function Dialog() {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref);
    return <div ref={ref} tabIndex={-1}><button>first</button><button>last</button></div>;
  }
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
  const { getByText, unmount } = render(<Dialog />);
  expect(document.activeElement).toBe(getByText('first'));
  fireEvent.keyDown(getByText('first'), { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(getByText('last'));
  fireEvent.keyDown(getByText('last'), { key: 'Tab' });
  expect(document.activeElement).toBe(getByText('first'));
  unmount();
  expect(document.activeElement).toBe(launcher);
  launcher.remove();
});

it('animated number reaches the target and cancels frames on unmount', () => {
  vi.useFakeTimers();
  const { result, rerender, unmount } = renderHook(({ value }) => useAnimatedNumber(value, 320), { initialProps: { value: 0 } });
  rerender({ value: 100 });
  act(() => vi.advanceTimersByTime(160));
  expect(result.current).toBeGreaterThan(0);
  expect(result.current).toBeLessThan(100);
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(100);
  rerender({ value: 200 });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
