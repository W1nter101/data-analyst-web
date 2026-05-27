'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { ChartRenderer } from '@/components/chart/ChartRenderer';
import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

type ChartWidgetProps = {
  widget: DashboardWidget;
};

export function ChartWidget({ widget }: ChartWidgetProps) {
  const router = useRouter();
  const { csv } = useCSVData();
  const chartConfig = useAppStore((s) =>
    s.charts.find((chart) => chart.id === widget.chartId),
  );
  const removeChart = useAppStore((s) => s.removeChart);
  const focusedWidgetId = useAppStore((s) => s.focusedWidgetId);
  const setFocusedWidgetId = useAppStore((s) => s.setFocusedWidgetId);
  const setEditingChartId = useAppStore((s) => s.setEditingChartId);

  const isFocused = focusedWidgetId === widget.id;

  // ── Dropdown menu state ──────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleEdit = useCallback(() => {
    setMenuOpen(false);
    setEditingChartId(widget.chartId ?? null);
    router.push('/visual-board-chart-composer');
  }, [setEditingChartId, widget.chartId, router]);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    if (widget.chartId) removeChart(widget.chartId);
  }, [removeChart, widget.chartId]);

  // ── Focus ring + scrollIntoView ──────────────────────
  useEffect(() => {
    if (!isFocused) return;

    const scrollTimer = setTimeout(() => {
      const el = document.querySelector(`[data-widget-id="${widget.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);

    const clearTimer = setTimeout(() => {
      setFocusedWidgetId(null);
    }, 2000);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [isFocused, widget.id, setFocusedWidgetId]);

  if (!csv) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 text-sm text-[var(--color-text-muted)]">
        No data loaded
      </div>
    );
  }

  if (!chartConfig) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-[var(--color-error)] bg-[var(--color-error)]/10 px-4 text-sm text-[var(--color-error)]">
        Chart not found
      </div>
    );
  }

  return (
    <div
      className={`flex h-full flex-col rounded-xl bg-[var(--color-surface)] p-3 transition-shadow duration-300 ${
        isFocused
          ? 'ring-2 ring-[var(--color-accent)]'
          : 'border border-[var(--color-border)]'
      }`}
    >
      {/* Drag handle */}
      <div className="chart-drag-handle mb-3 flex cursor-grab items-center justify-between gap-2 active:cursor-grabbing">
        <div className="flex min-w-0 items-center gap-2">
          <svg
            className="no-print size-4 shrink-0 text-[var(--color-text-faint)]"
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
          <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--color-text)]" title={chartConfig.title}>
            {chartConfig.title}
          </h3>
        </div>

        {/* ⋯ menu trigger */}
        <div ref={menuRef} className="relative no-print">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            aria-label="Chart actions"
          >
            <svg className="size-4" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md">
              {/* Edit chart */}
              <button
                type="button"
                onClick={handleEdit}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
                Edit chart
              </button>

              {/* Delete chart */}
              <button
                type="button"
                onClick={handleDelete}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10"
              >
                <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Delete chart
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ChartRenderer chartConfig={chartConfig} data={csv} />
      </div>
    </div>
  );
}
