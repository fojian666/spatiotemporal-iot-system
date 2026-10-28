import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import * as fullEcharts from 'echarts';
import { EChart } from '../../src/components/charts';
import { echarts } from '../../src/lib/echarts';

vi.mock('../../src/lib/echarts', () => ({ echarts: { init: vi.fn() } }));

it('replaces removed and empty live series rather than retaining stale curves', () => {
  fullEcharts.setPlatformAPI({ measureText: text => ({ width: text.length * 8 }) });
  const chart = fullEcharts.init(null, undefined, { renderer: 'svg', ssr: true, width: 500, height: 300 });
  vi.mocked(echarts.init).mockReturnValue(chart as unknown as ReturnType<typeof echarts.init>);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 500 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 300 });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const option = (names: string[]) => ({ xAxis: { type: 'category' as const, data: ['now'] }, yAxis: { type: 'value' as const }, series: names.map(name => ({ id: name, type: 'line' as const, name, data: [20] })) });
  const view = render(<EChart option={option(['one', 'two'])} replaceSeries />);
  try {
    expect((chart.getOption().series as unknown[])).toHaveLength(2);
    const inspect = chart as unknown as { getModel(): { getSeriesByIndex(index: number): unknown } };
    const original = inspect.getModel().getSeriesByIndex(0);
    view.rerender(<EChart option={option(['one'])} replaceSeries />);
    expect((chart.getOption().series as unknown[])).toHaveLength(1);
    expect(inspect.getModel().getSeriesByIndex(0)).toBe(original);
    view.rerender(<EChart option={option([])} replaceSeries />);
    expect((chart.getOption().series as unknown[])).toHaveLength(0);
  } finally {
    view.unmount();
    if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width); else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    if (height) Object.defineProperty(HTMLElement.prototype, 'clientHeight', height); else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    delete (document as { hidden?: boolean }).hidden;
  }
});
