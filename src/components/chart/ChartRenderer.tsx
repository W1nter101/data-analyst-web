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

const PIE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#7c3aed',
  '#ea580c',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#ca8a04',
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

  const data = entries.map(([x, y]) => ({ x, y }));
  return { data, note };
}

function MissingColumnsError() {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-xl border border-red-300 bg-red-50 px-4 text-center text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
      Selected chart columns were not found in the current CSV data.
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-xl border border-dashed border-black/15 bg-black/2 px-4 text-center text-sm text-foreground/70 dark:border-white/20 dark:bg-white/4">
      No chartable data for the selected columns.
    </div>
  );
}

export function ChartRenderer({ chartConfig, data }: ChartRendererProps) {
  const { type, xColumn, yColumn } = chartConfig;

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

  const { data: chartData, note } = buildChartData(filteredRows, xColumn, yColumn, data.schema);
  if (chartData.length === 0) {
    return <EmptyChartState />;
  }

  const yTickFormatter = (value: number) => value.toLocaleString();

  const xSchema = data.schema.find((col) => col.name === xColumn);
  const xType = xSchema?.type || 'string';
  const isStringX = xType === 'string' || xType === 'category';

  const xAxisProps = isStringX
    ? { interval: 0, angle: -35, textAnchor: 'end' as const, height: 60, tick: { fontSize: 11 } }
    : { interval: 'preserveStartEnd' as const };

  const tooltipStyle = {
    backgroundColor: '#1f2937',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
  };
  
  const tooltipItemStyle = {
    color: '#f9fafb',
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-black/10 bg-background p-2 dark:border-white/15">
      {note && (
        <div className="mb-2 text-center text-xs text-amber-600 dark:text-amber-400">
          {note}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
        {type === 'bar' ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Bar dataKey="y" fill="#2563eb" />
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Line type="monotone" dataKey="y" stroke="#7c3aed" dot={false} />
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Area type="monotone" dataKey="y" stroke="#16a34a" fill="#16a34a" fillOpacity={0.25} />
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
                <Cell key={`${entry.x}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" type="category" name={xColumn} />
            <YAxis dataKey="y" tickFormatter={yTickFormatter} name={yColumn} />
            <Tooltip 
              formatter={(value) => Number(value).toLocaleString()} 
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
            />
            <Scatter data={chartData} fill="#ea580c" />
          </ScatterChart>
        )}
      </ResponsiveContainer>
      </div>
    </div>
  );
}
