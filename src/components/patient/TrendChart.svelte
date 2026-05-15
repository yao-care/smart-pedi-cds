<script lang="ts">
  import { scaleLinear, scaleTime } from 'd3-scale';
  import { line } from 'd3-shape';
  import { axisBottom, axisLeft } from 'd3-axis';
  import { select } from 'd3-selection';
  import { extent } from 'd3-array';
  import { timeFormat } from 'd3-time-format';

  interface Props {
    data: Array<{ date: Date; value: number }>;
    baselineMean: number | null;
    baselineStd: number | null;
    indicatorName: string;
    unit: string;
    width?: number;
    height?: number;
  }

  let {
    data,
    baselineMean,
    baselineStd,
    indicatorName,
    unit,
    width = 600,
    height = 300,
  }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let tooltipText = $state('');
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipVisible = $state(false);

  const margin = { top: 20, right: 20, bottom: 40, left: 50 };

  const chartDescription = $derived(
    `${indicatorName} 趨勢圖，共 ${data.length} 筆資料${baselineMean != null ? `，基準線均值 ${baselineMean} ${unit}` : ''}`,
  );

  function renderChart(
    container: HTMLDivElement,
    chartData: Array<{ date: Date; value: number }>,
    chartWidth: number,
    chartHeight: number,
    mean: number | null,
    std: number | null,
    unitLabel: string,
    ariaLabel: string,
  ) {
    // Clear previous content
    select(container).selectAll('*').remove();

    const innerWidth = chartWidth - margin.left - margin.right;
    const innerHeight = chartHeight - margin.top - margin.bottom;

    // Scales
    const xExtent = extent(chartData, (d) => new Date(d.date)) as [Date, Date];
    const yValues = chartData.map((d) => d.value);
    let yMin = Math.min(...yValues);
    let yMax = Math.max(...yValues);

    // Extend Y domain for baseline band if present
    if (mean != null && std != null) {
      yMin = Math.min(yMin, mean - 2.5 * std);
      yMax = Math.max(yMax, mean + 2.5 * std);
    }

    const yPad = (yMax - yMin) * 0.1 || 1;

    const xScale = scaleTime().domain(xExtent).range([0, innerWidth]);
    const yScale = scaleLinear()
      .domain([yMin - yPad, yMax + yPad])
      .range([innerHeight, 0]);

    const svg = select(container)
      .append('svg')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('role', 'img')
      .attr('aria-label', ariaLabel);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Baseline band (mean +/- 2*std)
    if (mean != null && std != null) {
      const bandTop = mean + 2 * std;
      const bandBottom = mean - 2 * std;

      g.append('rect')
        .attr('x', 0)
        .attr('y', yScale(bandTop))
        .attr('width', innerWidth)
        .attr('height', yScale(bandBottom) - yScale(bandTop))
        .attr('class', 'baseline-band');

      // Baseline mean dashed line
      g.append('line')
        .attr('x1', 0)
        .attr('y1', yScale(mean))
        .attr('x2', innerWidth)
        .attr('y2', yScale(mean))
        .attr('class', 'baseline-mean');
    }

    // Data line
    const lineGen = line<{ date: Date; value: number }>()
      .x((d) => xScale(new Date(d.date)))
      .y((d) => yScale(d.value));

    g.append('path')
      .datum(chartData)
      .attr('fill', 'none')
      .attr('stroke', 'var(--color-accent)')
      .attr('stroke-width', 2)
      .attr('d', lineGen);

    // Data points
    g.selectAll('.data-point')
      .data(chartData)
      .enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('cx', (d) => xScale(new Date(d.date)))
      .attr('cy', (d) => yScale(d.value))
      .attr('r', 4)
      .attr('fill', (d) => {
        if (mean != null && std != null) {
          const deviation = Math.abs(d.value - mean);
          if (deviation > 2 * std) return 'var(--color-risk-critical)';
        }
        return 'var(--color-accent)';
      })
      .attr('stroke', 'var(--color-text-inverse)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer');

    // Anomaly rings for points beyond 2 std
    if (mean != null && std != null) {
      const anomalies = chartData.filter(
        (d) => Math.abs(d.value - mean) > 2 * std,
      );

      g.selectAll('.anomaly-ring')
        .data(anomalies)
        .enter()
        .append('circle')
        .attr('class', 'anomaly-ring')
        .attr('cx', (d) => xScale(new Date(d.date)))
        .attr('cy', (d) => yScale(d.value))
        .attr('r', 8)
        .attr('fill', 'none')
        .attr('stroke', 'var(--color-risk-critical)')
        .attr('stroke-width', 2)
        .attr('opacity', 0.6);
    }

    // Invisible hover targets for tooltip
    const formatDate = timeFormat('%Y-%m-%d %H:%M');

    g.selectAll('.hover-target')
      .data(chartData)
      .enter()
      .append('circle')
      .attr('class', 'hover-target')
      .attr('cx', (d) => xScale(new Date(d.date)))
      .attr('cy', (d) => yScale(d.value))
      .attr('r', 12)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        tooltipText = `${formatDate(new Date(d.date))}\n${d.value} ${unitLabel}`;
        tooltipX = xScale(new Date(d.date)) + margin.left;
        tooltipY = yScale(d.value) + margin.top - 10;
        tooltipVisible = true;
      })
      .on('mouseleave', () => {
        tooltipVisible = false;
      });

    // Axes
    const xAxis = axisBottom(xScale).ticks(5).tickFormat((d) => timeFormat('%m/%d')(d as Date));
    const yAxis = axisLeft(yScale).ticks(5);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', 'var(--color-text-muted)');

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', 'var(--color-text-muted)');

    // Y-axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 14)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('font-size', '0.75rem')
      .attr('fill', 'var(--color-text-subtle)')
      .text(unitLabel);

    // Style axis lines
    g.selectAll('.domain, .tick line').attr('stroke', 'var(--border-default)');
  }

  $effect(() => {
    if (!containerEl || data.length === 0) return;
    renderChart(containerEl, data, width, height, baselineMean, baselineStd, unit, chartDescription);
  });
</script>

<div class="trend-chart" aria-label={chartDescription}>
  <div class="chart-container" bind:this={containerEl}></div>

  {#if tooltipVisible}
    <div
      class="tooltip"
      style="left: {tooltipX}px; top: {tooltipY}px"
      role="status"
      aria-live="polite"
    >
      {#each tooltipText.split('\n') as line}
        <span>{line}</span>
      {/each}
    </div>
  {/if}

  {#if data.length === 0}
    <p class="no-data">暫無資料</p>
  {/if}
</div>

<style>
  .trend-chart {
    position: relative;
  }

  .chart-container {
    width: 100%;
    overflow-x: auto;
  }

  .tooltip {
    position: absolute;
    pointer-events: none;
    background-color: var(--color-text-base);
    color: var(--color-text-inverse);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    line-height: var(--lh-xs);
    display: flex;
    flex-direction: column;
    transform: translate(-50%, -100%);
    white-space: nowrap;
    z-index: 10;
  }

  .no-data {
    text-align: center;
    color: var(--color-text-muted);
    padding: var(--space-8) 0;
  }

  /* d3-drawn baseline band + mean line. Selectors target classes set in JS. */
  :global(.baseline-band) {
    fill: var(--color-risk-normal);
    opacity: 0.2;
  }

  :global(.baseline-mean) {
    stroke: var(--color-risk-normal);
    stroke-width: 1.5;
    stroke-dasharray: 6 4;
    opacity: 0.7;
  }
</style>
