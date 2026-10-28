import { describe, expect, it, vi } from 'vitest';
import { DEVICES } from '../../src/data/devices';
import { SCENARIOS, type ScenarioKey } from '../../src/data/scenarios';
import { askCopilot, resolveFocusDevice } from '../../src/services/llm';
import { buildAlerts, computeReading, deriveStatus, type SimContextValue } from '../../src/engine/simulation';

function context(key: ScenarioKey): SimContextValue {
  const readings = Object.fromEntries(DEVICES.map(d => [d.id, computeReading(d, 1, SCENARIOS[key])]));
  return {
    scenarioKey: key, scenario: SCENARIOS[key], running: true, speed: 1, tick: 1,
    simTime: new Date('2026-10-26T12:00:00+08:00'), readings,
    deviceStatuses: Object.fromEntries(DEVICES.map(d => [d.id, deriveStatus(d, readings[d.id], key)])),
    history: [], alerts: buildAlerts(key, new Date('2026-10-26T12:00:00+08:00')), events: [],
    stats: { total: 21, online: 18, warning: 2, offline: 1, onlineRate: 95, criticalAlerts: 0, activeAlerts: 1, unmannedActive: 5, regionHealth: 90, messageRate: 1280, avgTemperature: 20, avgHumidity: 50, avgPm25: 20, avgWaterLevel: 2.2, avgPh: 7.2, todayTasks: 24, dataQuality: 98.4 },
    source: 'local', linkStatus: 'local', setScenario: vi.fn(), setRunning: vi.fn(), setSpeed: vi.fn(), cycleAlert: vi.fn(),
  };
}

describe('device-specific investigations', () => {
  for (const d of DEVICES) for (const name of [d.id, d.shortName, d.name]) {
    it(`keeps ${name} on ${d.id}`, () => {
      expect(resolveFocusDevice(`${name}当前状态`)).toBe(d.id);
      const answer = askCopilot(`${name}当前状态`, context('normal'));
      expect(answer.text).toContain(d.id);
      expect(answer.evidence.find(e => e.id === `device-${d.id}`)?.href).toBe(`/map?focus=${d.id}`);
      const paths = answer.actions.filter(a => a.kind === 'navigate').map(a => a.value);
      expect(paths).toContain(`/map?focus=${d.id}`);
      expect(paths).toContain(`/simulation?focus=${d.id}`);
    });
  }
});

for (const key of Object.keys(SCENARIOS) as ScenarioKey[]) {
  describe(`${key} general intents`, () => {
    for (const [query, intent] of Object.entries({
      '现在有哪些风险': '区域风险研判', '在线率和离线设备': '设备在线态势',
      '分析水质': '水质专题研判', '分析气象': '气象环境分析', '生成区域简报': '区域简报生成',
      '什么是知识图谱': '图谱知识问答', '安排无人机巡检': '任务生成与调度', '随便聊聊': '通用问答',
    })) {
      it(query, () => {
        const ctx = context(key);
        const before = JSON.stringify(ctx.readings);
        const reply = askCopilot(query, ctx);
        expect(reply.text.length).toBeGreaterThan(20);
        expect(reply.text).not.toMatch(/undefined|NaN/);
        expect(reply.intent).toBe(intent);
        expect(reply.evidence.length).toBeGreaterThan(0);
        expect(new Set(reply.evidence.map(e => e.id)).size).toBe(reply.evidence.length);
        for (const action of reply.actions.filter(a => a.kind === 'navigate')) {
          expect(action.value).toMatch(/^\/((map|simulation|graph|platform|drone|copilot)(\?|$)|$)/);
        }
        expect(JSON.stringify(ctx.readings)).toBe(before);
        expect(ctx.setScenario).not.toHaveBeenCalled();
      });
    }
    it('requires an explicit action to switch scenarios', () => {
      const ctx = context(key);
      const answer = askCopilot('切换到暴雨场景', ctx);
      expect(answer.actions).toContainEqual(expect.objectContaining({ kind: 'scenario', value: 'storm' }));
      expect(ctx.setScenario).not.toHaveBeenCalled();
    });
  });
}

it('live mode does not invent values for missing or partially reported water and weather', () => {
  const ctx = context('normal');
  ctx.liveMode = true;
  ctx.readings = { 'WQ-04': { ph: 7.2, turbidity: 20 } };
  ctx.deviceStatuses = Object.fromEntries(DEVICES.map(d => [d.id, d.id === 'WQ-04' ? 'online' : 'offline']));
  const water = askCopilot('分析水质', ctx);
  expect(water.text).toContain('1 个有数据的水质站');
  expect(water.text).toContain('平均 pH 7.20');
  expect(water.text).toContain('平均浊度 20');
  expect(water.text).toContain('无数据');
  expect(water.text).not.toMatch(/NaN|undefined|平均氨氮 0\.00/);
  const device = askCopilot('WQ-01当前状态', ctx);
  expect(device.text).toContain('暂无实时观测');
  expect(device.text).toContain('无数据');
  expect(device.text).not.toMatch(/NaN|undefined|数据已参与空间聚合/);
  const weather = askCopilot('分析气象', ctx);
  expect(weather.text).toContain('森林火险气象等级：暂无数据');
  expect(weather.text).toContain('无法判断飞行条件');
  expect(weather.text).not.toMatch(/平均湿度 0%|NaN|undefined/);
});

it('live trends ignore missing samples rather than treating them as zero', () => {
  const ctx = context('normal');
  ctx.liveMode = true;
  ctx.readings = {}; // Historical values remain even after every device times out.
  ctx.history = [
    { ts: 1000, t: '10:00', temperature: 20, humidity: null, pm25: null, waterLevel: null, turbidity: null, ph: null },
    { ts: 2000, t: '10:01', temperature: 21, humidity: null, pm25: null, waterLevel: null, turbidity: null, ph: null },
  ];
  const missing = askCopilot('最近水位趋势如何', ctx);
  expect(missing.text).toContain('只有 0 个采样点');
  expect(missing.text).not.toContain('0.00 m');
  const available = askCopilot('最近气温趋势如何', ctx);
  expect(available.text).toContain('20.0°C');
  expect(available.text).toContain('21.0°C');
  expect(available.text).toContain('最后有效观测');
  expect(available.text).toContain('采样时间');
  expect(available.text).not.toContain('当前 21.0');
  const offline = askCopilot('在线率和离线设备', { ...ctx, deviceStatuses: Object.fromEntries(DEVICES.map(d => [d.id, 'offline' as const])), readings: {} });
  expect(offline.text).toContain('暂无实时电量');
  expect(offline.text).not.toContain('最后有效电量');
});
