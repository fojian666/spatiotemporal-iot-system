import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SimulationProvider, useSimulation } from '../../src/engine/simulation';
import * as api from '../../src/services/api';

vi.mock('../../src/services/api', async original => ({
  ...await original<typeof api>(), REMOTE_ENABLED: true,
  fetchBootstrap: vi.fn(), connectTelemetrySocket: vi.fn(), postScenario: vi.fn(),
  postSimulationState: vi.fn(), postAlertAck: vi.fn(),
}));

const snapshot = {
  scenario_key: 'normal', running: true, speed: 1, tick: 1,
  server_time: '2026-10-26T12:00:00+08:00', readings: {}, statuses: {},
  data_time: '2026-10-26T12:00:00+08:00', devices: [],
  server: { name: 'regression', version: 'test', timezone: 'Asia/Shanghai' },
  history: [], alerts: [], events: [],
  stats: { total: 21, online: 20, warning: 1, offline: 1, onlineRate: 95.2, criticalAlerts: 0, activeAlerts: 1, unmannedActive: 5, regionHealth: 90, messageRate: 1280, avgTemperature: 20, avgHumidity: 50, avgPm25: 20, avgWaterLevel: 2, avgPh: 7, todayTasks: 24, dataQuality: 98.4 },
  mqtt: { connected: false, messagesReceived: 0, messagesPublished: 0, host: 'test' },
} as api.BootstrapPayload;

it('remote bootstrap, socket snapshots and scenario failure preserve authoritative state', async () => {
  vi.mocked(api.fetchBootstrap).mockResolvedValue(snapshot);
  const stop = vi.fn();
  let receive!: (snapshot: api.ServerSnapshot) => void;
  vi.mocked(api.connectTelemetrySocket).mockImplementation((callback) => { receive = callback; return stop; });
  const { result, unmount } = renderHook(useSimulation, { wrapper: SimulationProvider });
  await waitFor(() => expect(result.current?.source).toBe('api'));
  act(() => receive({ ...snapshot, tick: 9 }));
  expect(result.current.tick).toBe(9);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(api.postScenario).mockRejectedValue(new api.ApiError(403, 'forbidden'));
  let success = true;
  await act(async () => { success = await result.current.setScenario('storm'); });
  expect(success).toBe(false);
  expect(result.current.scenarioKey).toBe('normal');
  vi.mocked(api.postScenario).mockResolvedValue({ ...snapshot, scenario_key: 'storm' });
  await act(async () => { success = await result.current.setScenario('storm'); });
  expect(success).toBe(true);
  expect(result.current.scenarioKey).toBe('storm');
  unmount();
  expect(stop).toHaveBeenCalledOnce();
});
