'use client';

import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';
import type { ChartType, ColumnSchema } from '@/types';

const CHART_TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'scatter'];

function isNumericColumn(schema: ColumnSchema | undefined): boolean {
  return schema?.type === 'number';
}

export function ChartPicker() {
  const { csv } = useCSVData();
  const addChart = useAppStore((s) => s.addChart);
  const dashboardWidgets = useAppStore((s) => s.dashboardWidgets);
  const updateDashboardLayout = useAppStore((s) => s.updateDashboardLayout);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xColumn, setXColumn] = useState('');
  const [yColumn, setYColumn] = useState('');
  const [title, setTitle] = useState('');

  const schema = useMemo(() => csv?.schema ?? [], [csv]);

  const numericColumns = useMemo(
    () => schema.filter((col) => col.type === 'number'),
    [schema],
  );

  const yIsNumeric = useMemo(() => {
    if (!csv || !yColumn) return false;
    return isNumericColumn(schema.find((col) => col.name === yColumn));
  }, [csv, schema, yColumn]);

  const canSubmit = Boolean(csv && xColumn && yColumn && yIsNumeric);

  if (!csv) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 bg-black/2 px-4 py-6 text-sm text-foreground/70 dark:border-white/20 dark:bg-white/4">
        Upload a CSV file first
      </div>
    );
  }

  const addDashboardWidget = (chartId: string) => {
    updateDashboardLayout([
      ...dashboardWidgets,
      {
        id: uuidv4(),
        chartId,
        layout: { x: 0, y: 0, w: 6, h: 4 },
      },
    ]);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const id = uuidv4();
    const finalTitle = title.trim() || `${yColumn} by ${xColumn}`;

    addChart({
      id,
      type: chartType,
      title: finalTitle,
      xColumn,
      yColumn,
    });
    addDashboardWidget(id);

    setTitle('');
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-black/10 bg-black/2 p-4 dark:border-white/15 dark:bg-white/4"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/80">Chart type</span>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
            className="rounded-md border border-black/15 bg-background px-3 py-2 text-sm dark:border-white/20"
          >
            {CHART_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/80">X column</span>
          <select
            value={xColumn}
            onChange={(e) => setXColumn(e.target.value)}
            className="rounded-md border border-black/15 bg-background px-3 py-2 text-sm dark:border-white/20"
          >
            <option value="">Select X column</option>
            {schema.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/80">Y column (numeric)</span>
          <select
            value={yColumn}
            onChange={(e) => setYColumn(e.target.value)}
            className="rounded-md border border-black/15 bg-background px-3 py-2 text-sm dark:border-white/20"
          >
            <option value="">Select Y column</option>
            {numericColumns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-foreground/80">Title (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={xColumn && yColumn ? `${yColumn} by ${xColumn}` : 'Y by X'}
            className="rounded-md border border-black/15 bg-background px-3 py-2 text-sm dark:border-white/20"
          />
        </label>
      </div>

      {yColumn && !yIsNumeric ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Y column must be numeric.
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md border border-black/15 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors enabled:hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:enabled:hover:bg-white/10"
        >
          Add Chart
        </button>
      </div>
    </form>
  );
}
