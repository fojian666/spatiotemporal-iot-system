import * as echarts from 'echarts/core';
import { GraphChart, LineChart } from 'echarts/charts';
import { AxisPointerComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GraphChart, GridComponent, TooltipComponent, LegendComponent, AxisPointerComponent, CanvasRenderer]);

export { echarts };
export { graphic } from 'echarts/core';
export type { ECharts, ECElementEvent } from 'echarts/core';
export type { EChartsOption } from 'echarts';
