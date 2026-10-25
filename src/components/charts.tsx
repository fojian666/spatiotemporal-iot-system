import { useEffect, useRef } from 'react';
import { echarts } from '../lib/echarts';
import type { ECElementEvent, ECharts, EChartsOption } from '../lib/echarts';

export function EChart({
  option,
  height = 260,
  className = '',
  onClick,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onClick?: (params: ECElementEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.on('click', (params) => clickRef.current?.(params));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 不用 lazyUpdate：首绘依赖 rAF，窗口被遮挡节流时图表会永远停留在空容器
    chartRef.current?.setOption(option, { notMerge: false });
  }, [option]);

  return <div ref={ref} className={`echart ${className}`} style={{ height }} />;
}
