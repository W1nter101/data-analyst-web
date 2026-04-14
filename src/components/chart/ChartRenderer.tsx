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

function buildChartData(parsed: ParsedCSV, xColumn: string, yColumn: string): ChartPoint[] {
  return parsed.rows
    .map((row) => {
      const xRaw = row[xColumn];
      const yRaw = row[yColumn];
      if (xRaw == null || yRaw == null) return null;
      const y = toNumber(yRaw);
      if (!Number.isFinite(y)) return null;
      return { x: String(xRaw), y };
    })
    .filter((point): point is ChartPoint => point !== null);
}

function MissingColumnsError() {
  return (
    <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-red-300 bg-red-50 px-4 text-center text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
      Selected chart columns were not found in the current CSV data.
    </div>
  );
}

function EmptyChartState() {
  return (
    <div className="flex h-[300px] w-full items-center justify-center rounded-xl border border-dashed border-black/15 bg-black/2 px-4 text-center text-sm text-foreground/70 dark:border-white/20 dark:bg-white/4">
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

  const chartData = buildChartData(data, xColumn, yColumn);
  if (chartData.length === 0) {
    return <EmptyChartState />;
  }

  const yTickFormatter = (value: number) => value.toLocaleString();

  return (
    <div className="h-[300px] w-full rounded-xl border border-black/10 bg-background p-2 dark:border-white/15">
      <ResponsiveContainer width="100%" height={300}>
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
            <XAxis dataKey="x" />
            <YAxis tickFormatter={yTickFormatter} />
            <Tooltip formatter={(value) => Number(value).toLocaleString()} />
            <Line type="monotone" dataKey="y" stroke="#7c3aed" dot={false} />
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="x" />
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
  );
}
