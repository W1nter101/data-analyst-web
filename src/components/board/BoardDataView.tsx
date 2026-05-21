'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAppStore } from '@/store/appStore';
import { aggregateChartData } from '@/lib/aggregateChartData';
import { typeIcon } from '@/components/composer/ComposerChartTypeSelector';
import type { ChartConfig, ChartType, DashboardWidget } from '@/types';

// ── Chart type icon for sidebar ────────────────────────────

function chartTypeIcon(type: ChartType): string {
  switch (type) {
    case 'bar': return '▮';
    case 'line': return '╱';
    case 'area': return '▲';
    case 'pie': return '◕';
    case 'scatter': return '⁘';
    default: return '▮';
  }
}

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

// ── Derived table type ─────────────────────────────────────

type DerivedTable = {
  widget: DashboardWidget;
  config: ChartConfig;
  rows: Record<string, string | number>[];
  columns: string[];
  snakeName: string;
};

// ── Main Component ─────────────────────────────────────────

export function BoardDataView() {
  const router = useRouter();
  const csv = useAppStore((s) => s.csv);
  const charts = useAppStore((s) => s.charts);
  const dashboardWidgets = useAppStore((s) => s.dashboardWidgets);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setFocusedWidgetId = useAppStore((s) => s.setFocusedWidgetId);

  // Build derived tables from widgets
  const tables = useMemo<DerivedTable[]>(() => {
    if (!csv) return [];
    return dashboardWidgets
      .map((widget) => {
        const config = charts.find((c) => c.id === widget.chartId);
        if (!config) return null;

        const rows = aggregateChartData(csv.rows, config);
        const columns: string[] = [config.xColumn];
        if (config.colorColumn) columns.push(config.colorColumn);
        columns.push(config.yColumn);

        return {
          widget,
          config,
          rows,
          columns,
          snakeName: toSnakeCase(config.title),
        };
      })
      .filter((t): t is DerivedTable => t !== null);
  }, [csv, charts, dashboardWidgets]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, Math.max(0, tables.length - 1));
  const selected = tables[safeIdx] ?? null;

  // ── Handle "Chart" button click ────────────────────────
  const handleGoToChart = (widgetId: string) => {
    setFocusedWidgetId(widgetId);
    setActiveTab('board');
  };

  // ── Empty state: no widgets ────────────────────────────
  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-foreground/15 bg-foreground/2 px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-foreground/5">
          <svg
            className="size-7 text-foreground/25"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground/65">
            Chưa có chart nào trên Board
          </p>
          <p className="mt-1 text-xs text-foreground/40">
            Tạo chart từ Chart Composer để bắt đầu
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/visual-board-chart-composer')}
          className="mt-1 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/15"
        >
          Mở Chart Composer
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-0 rounded-xl border border-foreground/10 overflow-hidden" style={{ minHeight: 400 }}>
      {/* ── Left sidebar: table list ──────────────────── */}
      <div className="w-60 shrink-0 border-r border-foreground/10 bg-foreground/[0.02] overflow-y-auto">
        <div className="p-3">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-foreground/40">
            Board Tables
          </h3>
          <div className="flex flex-col gap-1">
            {tables.map((table, idx) => {
              const isSelected = idx === safeIdx;
              return (
                <button
                  key={table.widget.id}
                  type="button"
                  onClick={() => setSelectedIdx(idx)}
                  className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border border-[var(--color-primary,#4f98a3)] bg-[var(--color-primary,#4f98a3)]/8'
                      : 'border border-transparent hover:bg-foreground/5'
                  }`}
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-foreground/8 text-[10px] font-bold text-foreground/50">
                    {chartTypeIcon(table.config.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {table.config.title}
                    </p>
                    <p className="truncate text-[10px] text-foreground/35">
                      {table.snakeName}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Main area: selected table ────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            {/* Action bar */}
            <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-foreground">
                  {selected.config.title}
                </h3>
                <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-medium text-foreground/55">
                  {selected.rows.length} rows
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleGoToChart(selected.widget.id)}
                className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-85"
              >
                <span className="text-[10px]">
                  {chartTypeIcon(selected.config.type)}
                </span>
                📊 Chart
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead className="sticky top-0 z-10 border-b border-foreground/10 bg-background">
                  <tr>
                    {selected.columns.map((col) => (
                      <th
                        key={col}
                        className={`min-w-[120px] px-4 py-2.5 text-xs font-semibold text-foreground/60 ${
                          col === selected.config.yColumn
                            ? 'text-right'
                            : 'text-left'
                        }`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={`border-b border-foreground/5 last:border-0 ${
                        rIdx % 2 === 1 ? 'bg-foreground/[0.02]' : ''
                      }`}
                    >
                      {selected.columns.map((col) => {
                        const isNumeric = col === selected.config.yColumn;
                        const val = row[col];
                        return (
                          <td
                            key={col}
                            className={`min-w-[120px] px-4 py-2 text-foreground/80 ${
                              isNumeric
                                ? 'text-right tabular-nums font-medium'
                                : 'text-left'
                            }`}
                          >
                            {isNumeric && typeof val === 'number'
                              ? val.toLocaleString()
                              : String(val ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {selected.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={selected.columns.length}
                        className="px-4 py-8 text-center text-sm text-foreground/40"
                      >
                        No aggregated data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-foreground/40">
            Select a table from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}
