import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ScenarioFeedback } from '../../src/components/ScenarioFeedback';
import { SCENARIOS } from '../../src/data/scenarios';

it('announces only a committed scenario change, survives ticks and cleans timers', () => {
  vi.useFakeTimers();
  const { rerender, unmount } = render(<ScenarioFeedback scenario={SCENARIOS.normal} />);
  expect(screen.getByRole('status').textContent).toBe('');
  rerender(<ScenarioFeedback scenario={{ ...SCENARIOS.normal }} />);
  expect(screen.getByRole('status').textContent).toBe('');
  rerender(<ScenarioFeedback scenario={SCENARIOS.storm} />);
  const first = document.querySelector('.scenario-feedback');
  expect(first?.textContent).toContain(SCENARIOS.storm.name);
  act(() => vi.advanceTimersByTime(900));
  rerender(<ScenarioFeedback scenario={{ ...SCENARIOS.storm }} />);
  expect(document.querySelector('.scenario-feedback')).toBe(first);
  act(() => vi.advanceTimersByTime(900));
  expect(screen.getByRole('status').textContent).toBe('');
  rerender(<ScenarioFeedback scenario={SCENARIOS.fire} />);
  expect(screen.getByRole('status').textContent).toContain(SCENARIOS.fire.name);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
