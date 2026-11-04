import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, RadarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, RadarComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { Dimension, Interview } from '../../types/domain';
import { dateText } from '../../utils/interview';
echarts.use([LineChart, RadarChart, GridComponent, TooltipComponent, RadarComponent, CanvasRenderer]);
function Chart({
  option,
  label,
  height = 240,
}: {
  option: EChartsCoreOption;
  label: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);
  return <div ref={ref} role="img" aria-label={label} style={{ width: '100%', height }} />;
}
export function TrendChart({ items }: { items: Interview[] }) {
  const sorted = items
    .filter((i) => i.overall_score !== null)
    .slice(0, 12)
    .reverse();
  if (!sorted.length)
    return (
      <div className="chart-empty">
        <div className="empty-chart-lines">
          <i />
          <i />
          <i />
          <i />
        </div>
        <p>完成面试后，在这里看见你的成长轨迹</p>
        <small>基于历史报告的综合评分</small>
      </div>
    );
  return (
    <Chart
      label={sorted.map((i) => `${dateText(i.created_at)} ${i.overall_score} 分`).join('；')}
      height={215}
      option={{
        grid: { left: 30, right: 20, top: 20, bottom: 25 },
        tooltip: { trigger: 'axis', renderMode: 'richText' },
        xAxis: {
          type: 'category',
          data: sorted.map((i) => dateText(i.created_at)),
          boundaryGap: false,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#929bad', fontSize: 11 },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 100,
          splitNumber: 4,
          axisLabel: { color: '#929bad', fontSize: 11 },
          splitLine: { lineStyle: { color: '#edf0f6', type: 'dashed' } },
        },
        series: [
          {
            type: 'line',
            data: sorted.map((i) => i.overall_score),
            smooth: true,
            symbolSize: 7,
            lineStyle: { color: '#456beb', width: 3 },
            itemStyle: { color: '#456beb', borderWidth: 3, borderColor: '#fff' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#456beb25' },
                { offset: 1, color: '#456beb00' },
              ]),
            },
          },
        ],
      }}
    />
  );
}
export function ScoreRadar({ dimensions }: { dimensions: Dimension[] }) {
  const assessed = dimensions.filter((d) => d.score !== null);
  if (!assessed.length)
    return (
      <div className="radar-empty">
        <div className="radar-placeholder">✧</div>
        <strong>暂无可评分的证据</strong>
        <p>证据不足的维度标记为「无法判断」</p>
      </div>
    );
  return (
    <Chart
      label={dimensions.map((d) => `${d.name}：${d.score ?? '无法判断'}`).join('；')}
      height={290}
      option={{
        tooltip: { renderMode: 'richText' },
        radar: {
          indicator: assessed.map((d) => ({ name: d.name, max: 100 })),
          radius: '62%',
          axisName: { color: '#67738c', fontSize: 11 },
          splitArea: { areaStyle: { color: ['#fafbff', '#f3f6fd'] } },
          splitLine: { lineStyle: { color: '#e5eaf5' } },
          axisLine: { lineStyle: { color: '#e5eaf5' } },
        },
        series: [
          {
            type: 'radar',
            data: [
              {
                value: assessed.map((d) => d.score),
                name: '能力维度',
                areaStyle: { color: '#4168e833' },
                lineStyle: { color: '#4168e8', width: 2 },
                itemStyle: { color: '#4168e8' },
              },
            ],
          },
        ],
      }}
    />
  );
}
