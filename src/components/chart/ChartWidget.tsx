'use client';

import { ChartRenderer } from '@/components/chart/ChartRenderer';
import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

type ChartWidgetProps = {
  widget: DashboardWidget;
};

export function ChartWidget({ widget }: ChartWidgetProps) {
  const { csv } = useCSVData();
  const chartConfig = useAppStore((s) =>
    s.charts.find((chart) => chart.id === widget.chartId),
  );
  const removeChart = useAppStore((s) => s.removeChart);

  if (!csv) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-black/15 bg-black/2 px-4 text-sm text-foreground/70 dark:border-white/20 dark:bg-white/4">
        No data loaded
      </div>
    );
  }

  if (!chartConfig) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-red-300 bg-red-50 px-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
        Chart not found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-black/10 bg-background p-3 dark:border-white/15">
      {/* Drag handle — only this bar is the drag target, not the chart area */}
      <div className="chart-drag-handle mb-3 flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2">
          <svg
            className="size-4 shrink-0 text-foreground/40"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="4" cy="3" r="1.5" />
            <circle cx="12" cy="3" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="12" cy="8" r="1.5" />
            <circle cx="4" cy="13" r="1.5" />
            <circle cx="12" cy="13" r="1.5" />
          </svg>
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground" title={chartConfig.title}>
            {chartConfig.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => removeChart(widget.chartId)}
          className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          aria-label={`Delete ${chartConfig.title}`}
        >
          Delete
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <ChartRenderer chartConfig={chartConfig} data={csv} />
      </div>
    </div>
  );
}
