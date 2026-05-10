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

import type { ChartConfig, ParsedCSV } from '@/types';

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

function buildChartData(parsed: ParsedCSV, xColumn: string, yColumn: string): { data: ChartPoint[], note?: string } {
  // Aggregate: group by xColumn, sum yColumn per group.
  // Without this, "Units Sold by Country" would show every raw row
  // instead of one summed bar per country.
  const groups = new Map<string, number>();

  for (const row of parsed.rows) {
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

  const xSchema = parsed.schema.find((col) => col.name === xColumn);
  const xType = xSchema?.type || 'string';

  // Apply a limit if there are > 50 unique X values
  if (entries.length > 50) {
    // keep top 20 by Y value
    entries.sort((a, b) => b[1] - a[1]);
    entries = entries.slice(0, 20);
    note = `Hiển thị top 20 trong số ${groups.size} mục (do có quá nhiều dữ liệu)`;
  } else {
    // Sort appropriately
    if (xType === 'number') {
      entries.sort((a, b) => {
        const numA = Number(a[0]);
        const numB = Number(b[0]);
        return numA - numB;
      });
    } else if (xType === 'date') {
      entries.sort((a, b) => {
        const dateA = new Date(a[0]).getTime();
        const dateB = new Date(b[0]).getTime();
        return (Number.isNaN(dateA) ? 0 : dateA) - (Number.isNaN(dateB) ? 0 : dateB);
      });
    }
    // For string, show ALL unique values, no limit
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

  const { data: chartData, note } = buildChartData(data, xColumn, yColumn);
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
            <Tooltip formatter={(value) => Number(value).toLocaleString()} />
            <Bar dataKey="y" fill="#2563eb" />
          </BarChart>
        ) : type === 'line' ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip formatter={(value) => Number(value).toLocaleString()} />
            <Line type="monotone" dataKey="y" stroke="#7c3aed" dot={false} />
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip formatter={(value) => Number(value).toLocaleString()} />
            <Area type="monotone" dataKey="y" stroke="#16a34a" fill="#16a34a" fillOpacity={0.25} />
          </AreaChart>
        ) : type === 'pie' ? (
          <PieChart>
            <Tooltip formatter={(value) => Number(value).toLocaleString()} />
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
            <Tooltip formatter={(value) => Number(value).toLocaleString()} />
            <Scatter data={chartData} fill="#ea580c" />
          </ScatterChart>
        )}
      </ResponsiveContainer>
      </div>
    </div>
  );
}
