'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
} from 'recharts';

import type { ChartConfig, ChartFilterDef, ParsedCSV } from '@/types';

type ChartRendererProps = {
  chartConfig: ChartConfig;
  data: ParsedCSV;
};

type ChartPoint = {
  x: string;
  y: number;
};

const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

function toNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  return Number.parseFloat(cleaned);
}

// ── Filter rows using ChartConfig.filters ─────────────────────────

function applyFilters(
  rows: Record<string, string>[],
  filters: ChartFilterDef[],
): Record<string, string>[] {
  return rows.filter((row) =>
    filters.every((f) => {
      const cell = String(row[f.column] ?? '').trim();
      const cellLower = cell.toLowerCase();

      switch (f.operator) {
        case 'eq':
          return cellLower === String(f.value).trim().toLowerCase();
        case 'in': {
          const vals = (Array.isArray(f.value) ? f.value : [f.value]).map((v) =>
            String(v).trim().toLowerCase(),
          );
          return vals.includes(cellLower);
        }
        case 'gt':
          return Number(cell) > Number(f.value);
        case 'lt':
          return Number(cell) < Number(f.value);
        case 'gte':
          return Number(cell) >= Number(f.value);
        case 'lte':
          return Number(cell) <= Number(f.value);
        case 'contains':
          return cellLower.includes(String(f.value).trim().toLowerCase());
        default:
          return true;
      }
    }),
  );
}

// ── Build chart data from rows ────────────────────────────────────

function buildChartData(
  rows: Record<string, string>[],
  xColumn: string,
  yColumn: string,
  schema: ParsedCSV['schema'],
  sortOrder?: 'asc' | 'desc' | 'none',
): { data: ChartPoint[]; note?: string } {
  // Aggregate: group by xColumn, sum yColumn per group.
  const groups = new Map<string, number>();

  for (const row of rows) {
    const xRaw = row[xColumn];
    const yRaw = row[yColumn];
    if (xRaw == null || yRaw == null) continue;
    const y = toNumber(yRaw);
    if (!Number.isFinite(y)) continue;
    const key = String(xRaw);
    groups.set(key, (groups.get(key) || 0) + y);
  }

  let entries = Array.from(groups.entries());
  let note: string | undefined;

  const xSchema = schema.find((col) => col.name === xColumn);
  const xType = xSchema?.type || 'string';

  // Apply a limit if there are > 50 unique X values
  if (entries.length > 50) {
    entries.sort((a, b) => b[1] - a[1]);
    entries = entries.slice(0, 20);
    note = `Hiển thị top 20 trong số ${groups.size} mục (do có quá nhiều dữ liệu)`;
  } else {
    if (sortOrder === 'desc') {
      entries.sort((a, b) => b[1] - a[1]);
    } else if (sortOrder === 'asc') {
      entries.sort((a, b) => a[1] - b[1]);
    } else {
      if (xType === 'number') {
        entries.sort((a, b) => Number(a[0]) - Number(b[0]));
      } else if (xType === 'date') {
        entries.sort((a, b) => {
          const dateA = new Date(a[0]).getTime();
          const dateB = new Date(b[0]).getTime();
          return (Number.isNaN(dateA) ? 0 : dateA) - (Number.isNaN(dateB) ? 0 : dateB);
        });
      }
    }
  }

  const data = entries.map(([x, y]) => ({ x, y }));
  return { data, note };
}

function MissingColumnsError() {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-xl border border-[var(--color-error)] bg-[var(--color-error)]/10 px-4 text-center text-sm text-[var(--color-error)]">
      Selected chart columns were not found in the current CSV data.
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 text-center text-sm text-[var(--color-text-muted)]">
      No chartable data for the selected columns.
    </div>
  );
}

export function ChartRenderer({ chartConfig, data }: ChartRendererProps) {
  const { type, xColumn, yColumn, sortOrder } = chartConfig;

  const hasX = data.headers.includes(xColumn);
  const hasY = data.headers.includes(yColumn);
  if (!hasX || !hasY) {
    return <MissingColumnsError />;
  }

  // Apply AI-generated filters before aggregation
  const filteredRows =
    chartConfig.filters && chartConfig.filters.length > 0
      ? applyFilters(data.rows, chartConfig.filters)
      : data.rows;

  const { data: chartData, note } = buildChartData(filteredRows, xColumn, yColumn, data.schema, sortOrder);
  if (chartData.length === 0) {
    return <EmptyChartState />;
  }

  const yTickFormatter = (value: number) => value.toLocaleString();

  const xSchema = data.schema.find((col) => col.name === xColumn);
  const xType = xSchema?.type || 'string';
  const isStringX = xType === 'string' || xType === 'category';

  const xAxisProps = isStringX
    ? { interval: 0, angle: -35, textAnchor: 'end' as const, height: 60, tick: { fontSize: 11, fill: 'var(--color-text-muted)' } }
    : { interval: 'preserveStartEnd' as const, tick: { fontSize: 11, fill: 'var(--color-text-muted)' } };

  const tooltipStyle = {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
  };
  
  const tooltipItemStyle = {
    color: 'var(--color-text)',
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl p-2">
      {note && (
        <div className="mb-2 text-center text-xs text-[var(--color-warning)]">
          {note}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="x" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <YAxis tickFormatter={yTickFormatter} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Bar dataKey="y" fill="var(--chart-1)">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis tickFormatter={yTickFormatter} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Line type="monotone" dataKey="y" stroke="var(--chart-1)" dot={false} />
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis tickFormatter={yTickFormatter} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Area type="monotone" dataKey="y" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.25} />
          </AreaChart>
        ) : type === 'pie' ? (
          <PieChart>
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Pie data={chartData} dataKey="y" nameKey="x" cx="50%" cy="50%" outerRadius={100}>
              {chartData.map((entry, index) => (
                <Cell key={`${entry.x}-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="x" type="category" name={xColumn} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <YAxis dataKey="y" tickFormatter={yTickFormatter} name={yColumn} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Scatter data={chartData} fill="var(--chart-6)">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        )}
      </ResponsiveContainer>
      </div>
    </div>
  );
}
