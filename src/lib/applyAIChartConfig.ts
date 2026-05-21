import type { ChartType } from '@/types';

// ── Types ──────────────────────────────────────────────────────────

export interface AIChartFilter {
  column: string;
  operator: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | string[] | number;
}

export interface AIChartAggregation {
  function: 'sum' | 'avg' | 'count' | 'min' | 'max';
  group_by?: string;
}

export interface AIChartIntent {
  intent: string;
  chart_type?: string;
  x_axis?: string;
  y_axis?: string;
  filters?: AIChartFilter[];
  aggregation?: AIChartAggregation;
  title?: string;
  color_by?: string;
}

export interface ProcessedChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
  }>;
  xColumn: string;
  yColumn: string;
  chartType: ChartType;
  title: string;
}

// ── Filter logic ───────────────────────────────────────────────────

function applyFilters(
  rows: Record<string, string>[],
  filters: AIChartFilter[],
): Record<string, string>[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const cellValue = row[f.column];
      const cellStr = String(cellValue ?? '').trim();

      switch (f.operator) {
        case 'eq':
          return cellStr === String(f.value);
        case 'in': {
          const values = Array.isArray(f.value) ? f.value : [f.value];
          return values.some(
            (v) => cellStr.toLowerCase() === String(v).trim().toLowerCase(),
          );
        }
        case 'gt':
          return Number(cellValue) > Number(f.value);
        case 'lt':
          return Number(cellValue) < Number(f.value);
        case 'gte':
          return Number(cellValue) >= Number(f.value);
        case 'lte':
          return Number(cellValue) <= Number(f.value);
        case 'contains':
          return cellStr.toLowerCase().includes(String(f.value).toLowerCase());
        default:
          return true;
      }
    }),
  );
}

// ── Aggregation logic ──────────────────────────────────────────────

function aggregate(
  rows: Record<string, string>[],
  yCol: string,
  groupByCol: string,
  aggFn: string,
): { labels: string[]; data: number[] } {
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const key = String(row[groupByCol] ?? '');
    const val = Number(String(row[yCol] ?? '0').replace(/,/g, ''));
    if (Number.isNaN(val)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(val);
  }

  const labels: string[] = [];
  const data: number[] = [];

  for (const [key, vals] of groups) {
    labels.push(key);
    switch (aggFn) {
      case 'sum':
        data.push(vals.reduce((a, b) => a + b, 0));
        break;
      case 'avg':
        data.push(vals.reduce((a, b) => a + b, 0) / vals.length);
        break;
      case 'count':
        data.push(vals.length);
        break;
      case 'min':
        data.push(Math.min(...vals));
        break;
      case 'max':
        data.push(Math.max(...vals));
        break;
      default:
        data.push(vals.reduce((a, b) => a + b, 0));
    }
  }

  return { labels, data };
}

// ── Chart type normalization ───────────────────────────────────────

const CHART_TYPE_MAP: Record<string, ChartType> = {
  line: 'line',
  bar: 'bar',
  pie: 'pie',
  scatter: 'scatter',
  area: 'area',
};

function normalizeChartType(raw: string): ChartType {
  return CHART_TYPE_MAP[raw.toLowerCase()] ?? 'bar';
}

// ── Main function ──────────────────────────────────────────────────

/**
 * Process raw CSV rows using an AI-generated chart intent config.
 *
 * Pipeline: filter → aggregate → format for chart rendering.
 */
export function applyAIChartConfig(
  rawRows: Record<string, string>[],
  config: AIChartIntent,
): ProcessedChartData {
  const xCol = config.x_axis ?? '';
  const yCol = config.y_axis ?? '';
  const chartType = normalizeChartType(config.chart_type ?? 'bar');
  const title = config.title ?? `${yCol} theo ${xCol}`;

  // STEP 1: Apply filters
  let rows = rawRows;
  if (config.filters && config.filters.length > 0) {
    rows = applyFilters(rows, config.filters);
  }

  // STEP 2: Aggregation
  if (config.aggregation) {
    const groupBy = config.aggregation.group_by ?? xCol;
    const { labels, data } = aggregate(rows, yCol, groupBy, config.aggregation.function);
    return { labels, datasets: [{ label: yCol, data }], xColumn: xCol, yColumn: yCol, chartType, title };
  }

  // STEP 3: Multi-series (color_by)
  if (config.color_by) {
    const seriesKeys = [...new Set(rows.map((r) => String(r[config.color_by!] ?? '')))];
    const xValues = [...new Set(rows.map((r) => String(r[xCol] ?? '')))];

    const datasets = seriesKeys.map((seriesKey) => {
      const seriesRows = rows.filter((r) => String(r[config.color_by!]) === seriesKey);
      const { labels: _, data } = aggregate(seriesRows, yCol, xCol, 'sum');
      // Align data to xValues order
      const aligned = xValues.map((xVal) => {
        const idx = [...new Set(seriesRows.map((r) => String(r[xCol])))].indexOf(xVal);
        return idx >= 0 ? data[idx] : 0;
      });
      return { label: seriesKey, data: aligned };
    });

    return { labels: xValues, datasets, xColumn: xCol, yColumn: yCol, chartType, title };
  }

  // STEP 4: Default — group by X, sum Y (same as ChartRenderer.buildChartData)
  const { labels, data } = aggregate(rows, yCol, xCol, 'sum');
  return { labels, datasets: [{ label: yCol, data }], xColumn: xCol, yColumn: yCol, chartType, title };
}
