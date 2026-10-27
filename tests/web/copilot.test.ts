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
