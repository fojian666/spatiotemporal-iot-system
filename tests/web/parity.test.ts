import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEVICES } from '../../src/data/devices';
import { SCENARIOS, type ScenarioKey } from '../../src/data/scenarios';
import { KNOWLEDGE_NODES, KNOWLEDGE_LINKS } from '../../src/data/knowledge';
import { buildAlerts, computeReading, deriveStatus, metricState, SimulationProvider, useSimulation } from '../../src/engine/simulation';

function loadBackend() {
  const python = process.env.TEST_PYTHON || (existsSync('backend/.venv/bin/python') ? resolve('backend/.venv/bin/python') : 'python3');
  const cwd = mkdtempSync(join(tmpdir(), 'iot-parity-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('IOT_')));
  try {
    return JSON.parse(execFileSync(python, [resolve('tests/parity.py')], {
      encoding: 'utf8', cwd, env: { ...env, TZ: 'Asia/Shanghai', IOT_TIMEZONE: 'Asia/Shanghai' },
    }));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
const backend = loadBackend();

describe('front/back catalog contracts', () => {
  it('matches every expanded device, metric, threshold and identity', () => {
    expect(DEVICES).toHaveLength(21);
    expect(backend.devices.map((d: any) => d.id).sort()).toEqual(DEVICES.map(d => d.id).sort());
    expect(new Set(DEVICES.map(d => d.id)).size).toBe(DEVICES.length);
    for (const device of DEVICES) {
      const other = backend.devices.find((d: any) => d.id === device.id);
      expect(other, device.id).toBeDefined();
      for (const [key, value] of Object.entries(device)) {
        if (typeof value === 'number') expect(other[key], `${device.id}.${key}`).toBeCloseTo(value, 6);
        else expect(other[key], `${device.id}.${key}`).toEqual(value);
      }
    }
  });
  it('keeps all scenarios and graph entities/edges synchronized', () => {
    expect(backend.scenarios).toEqual(SCENARIOS);
    expect(backend.knowledge.nodes).toEqual(KNOWLEDGE_NODES);
    expect(backend.knowledge.links).toEqual(KNOWLEDGE_LINKS);
    const ids = new Set(KNOWLEDGE_NODES.map(n => n.id));
    for (const link of KNOWLEDGE_LINKS) {
      expect(ids.has(link.source)).toBe(true);
      expect(ids.has(link.target)).toBe(true);
    }
  });
});

describe('simulation parity: all devices × four scenarios × nine ticks', () => {
  for (const sample of backend.cases) {
    it(`${sample.key} tick=${sample.tick}`, () => {
      const scenario = SCENARIOS[sample.key as ScenarioKey];
      for (const device of DEVICES) {
        const reading = computeReading(device, sample.tick, scenario);
        expect(Object.keys(reading).sort()).toEqual(Object.keys(sample.readings[device.id]).sort());
        for (const [key, value] of Object.entries(reading)) {
          expect(sample.readings[device.id][key], `${device.id}.${key}`).toBeCloseTo(value, 6);
        }
        expect(deriveStatus(device, reading, scenario.key), device.id).toBe(sample.statuses[device.id]);
      }
    });
  }
  for (const key of Object.keys(SCENARIOS) as ScenarioKey[]) {
    it(`${key} alert content, order, time and initial status`, () => {
      expect(buildAlerts(key, new Date('2026-10-26T12:00:00+08:00'))).toEqual(backend.alerts[key]);
    });
  }
  it('locks threshold equality semantics for high, low and range', () => {
    for (const d of DEVICES) for (const metric of d.metrics) {
      if (metric.direction === 'high') {
        expect(metricState(metric, metric.warn)).toBe('warning');
        expect(metricState(metric, metric.crit)).toBe('critical');
      } else if (metric.direction === 'low') {
        expect(metricState(metric, metric.warn)).toBe('warning');
        expect(metricState(metric, metric.crit)).toBe('critical');
      } else {
        expect(metricState(metric, metric.warn)).toBe('normal');
        expect(metricState(metric, metric.crit + 0.01)).toBe('critical');
      }
    }
  });
});


describe('aggregate KPI parity against the live Python implementation', () => {
  for (const sample of backend.cases.filter((item: any) => item.tick <= 120)) {
    it(`${sample.key} tick=${sample.tick} totals, averages and risk score`, async () => {
      vi.useFakeTimers();
      const { result, unmount } = renderHook(useSimulation, { wrapper: SimulationProvider });
      await act(async () => { await result.current.setScenario(sample.key); });
      act(() => vi.advanceTimersByTime(sample.tick * 1000));
      expect(result.current.tick).toBe(sample.tick);
      for (const [key, value] of Object.entries(result.current.stats)) {
        // The API serializes onlineRate to one decimal; the UI retains full precision.
        expect(sample.stats[key], key).toBeCloseTo(value, key === 'onlineRate' ? 1 : 6);
      }
      unmount();
    });
  }
});
