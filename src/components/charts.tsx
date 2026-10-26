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
  const optionRef = useRef(option);
  optionRef.current = option;
  const renderRef = useRef<(() => void) | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.on('click', (params) => clickRef.current?.(params));
    const node = ref.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = typeof IntersectionObserver === 'undefined';
    let frame: number | null = null;
    const render = () => {
      if (!visible || document.hidden || !node.clientWidth || !node.clientHeight) return;
      if (chart.getWidth() !== node.clientWidth || chart.getHeight() !== node.clientHeight) chart.resize();
      // Canvas 不受全局 CSS 降级规则影响，在共享图表入口统一处理。
      const current = optionRef.current;
      chart.setOption({ ...current, animation: motion.matches ? false : current.animation ?? true,
        aria: { enabled: true, data: { maxCount: 6 } } }, { notMerge: false });
    };
    renderRef.current = render;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; render(); });
    });
    observer.observe(node);
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) render();
    });
    intersection?.observe(node);
    motion.addEventListener('change', render);
    document.addEventListener('visibilitychange', render);
    return () => {
      observer.disconnect();
      intersection?.disconnect();
      motion.removeEventListener('change', render);
      document.removeEventListener('visibilitychange', render);
      if (frame !== null) window.cancelAnimationFrame(frame);
      renderRef.current = null;
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // 屏幕外只保存最新 option，回到视口后一次更新，避免逐秒重绘不可见图表。
    renderRef.current?.();
  }, [option]);

  return <div ref={ref} className={`echart ${className}`} style={{ height }} />;
}
