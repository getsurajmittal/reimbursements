/* Chart.js wrappers.

   Colour rules this file follows (see README "Colour choices"):
   - Series colour follows the entity, never its position in a filtered list.
     Bills are always slot 1, pocket money slot 2, paid-back slot 3.
   - One y-axis, always. Two measures of different scale get two charts.
   - Thin marks, hairline grid, no gridlines on the category axis.
   - Legends are rendered as HTML beside the canvas (see ui/legend markup) so
     identity never rests on colour alone.
*/

import { fmtMoney, fmtMoneyShort } from './util.js';

const instances = new Map();

/** Read the live theme tokens so charts follow light/dark without a reload. */
export function chartColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    s1: v('--series-1'),
    s2: v('--series-2'),
    s3: v('--series-3'),
    surface: v('--surface'),
    grid: v('--grid'),
    axis: v('--axis'),
    text: v('--text'),
    muted: v('--text-muted'),
    good: v('--good'),
  };
}

function baseOptions(c) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false }, // rendered as HTML instead
      tooltip: {
        backgroundColor: c.text,
        titleColor: c.surface,
        bodyColor: c.surface,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: c.axis },
        ticks: { color: c.muted, font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: c.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: c.muted,
          font: { size: 11 },
          maxTicksLimit: 5,
          padding: 6,
          callback: (val) => fmtMoneyShort(val),
        },
      },
    },
  };
}

function mount(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;
  instances.get(canvasId)?.destroy();
  const chart = new Chart(canvas, config);
  instances.set(canvasId, chart);
  return chart;
}

export function destroyCharts() {
  instances.forEach(chart => chart.destroy());
  instances.clear();
}

/**
 * The flow comparison, bucketed by whatever the selected range implies (weeks
 * for a month, months for a year, quarters beyond that). Three series, so a
 * legend is mandatory - the caller renders `flowLegend()` next to it, plus a
 * table view (the aqua step sits below 3:1 on the light surface, so the
 * figures must also be readable as text).
 */
export function flowChart(canvasId, series, { showPocket = true } = {}) {
  const c = chartColors();
  const datasets = [
    { label: 'Bills submitted', data: series.bills, backgroundColor: c.s1 },
    ...(showPocket ? [{ label: 'Pocket money', data: series.pocket, backgroundColor: c.s2 }] : []),
    { label: 'Paid back', data: series.paid, backgroundColor: c.s3 },
  ];

  return mount(canvasId, {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: datasets.map(d => ({
        ...d,
        borderRadius: 4,          // rounded data-end only
        borderSkipped: 'bottom',  // square where it meets the baseline
        barPercentage: 0.92,
        categoryPercentage: 0.68, // breathing room between groups
        maxBarThickness: 22,
      })),
    },
    options: baseOptions(c),
  });
}

export function flowLegend({ showPocket = true } = {}) {
  const items = [
    ['s1', 'Bills submitted'],
    ...(showPocket ? [['s2', 'Pocket money']] : []),
    ['s3', 'Paid back'],
  ];
  return `<div class="legend">${items.map(([slot, label]) => `
    <span class="legend__item"><i class="swatch swatch--${slot}"></i>${label}</span>
  `).join('')}</div>`;
}

/** Draws the value of the last point, so the line is direct-labelled. */
const endpointLabel = {
  id: 'endpointLabel',
  afterDatasetsDraw(chart, _args, opts) {
    const meta = chart.getDatasetMeta(0);
    const last = meta?.data?.[meta.data.length - 1];
    if (!last) return;
    const value = chart.data.datasets[0].data[meta.data.length - 1];
    const { ctx } = chart;
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = opts.color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmtMoneyShort(value), last.x - 6, last.y - 8);
    ctx.restore();
  },
};

/**
 * Outstanding balance at each bucket's close. A single series, so no legend -
 * the card title names it and the endpoint carries its own label.
 */
export function balanceChart(canvasId, labels, values) {
  const c = chartColors();
  const options = baseOptions(c);
  options.plugins.tooltip.callbacks.label = (ctx) => ` Outstanding: ${fmtMoney(ctx.parsed.y)}`;
  options.plugins.endpointLabel = { color: c.text };

  return mount(canvasId, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Outstanding',
        data: values,
        borderColor: c.s1,
        backgroundColor: withAlpha(c.s1, 0.12),
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: c.s1,
        pointBorderColor: c.surface,
        pointBorderWidth: 2, // 2px surface ring on the markers
      }],
    },
    options,
    plugins: [endpointLabel],
  });
}

function withAlpha(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return hex;
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
