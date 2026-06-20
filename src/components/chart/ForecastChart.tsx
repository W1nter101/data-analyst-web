'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ForecastResult } from '@/lib/forecast';
import { useAppStore } from '@/store/appStore';

interface Props {
  result: ForecastResult;
  widgetId?: string;
}

type ChartPoint = {
  label: string;
  actual?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
};

export function ForecastChart({ result, widgetId }: Props) {
  const { historical, forecast, targetColumn } = result;

  const removeWidget = useAppStore((s) => s.removeWidget);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    if (widgetId) removeWidget(widgetId);
  }, [removeWidget, widgetId]);

  // Merge historical + forecast into single array for Recharts
  const data: ChartPoint[] = [
    ...historical.map((p) => ({ label: p.label, actual: p.value })),
    ...forecast.map((p) => ({
      label: p.label,
      forecast: Math.round(p.value),
      lower: Math.round(p.lower),
      upper: Math.round(p.upper),
    })),
  ];

  // Label of last historical point (split line)
  const splitLabel = historical[historical.length - 1]?.label;

  const tooltipStyle = {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
  };

  const LABEL_MAP: Record<string, string> = {
    actual: 'Thực tế',
    forecast: 'Dự báo',
    lower: 'CI thấp',
    upper: 'CI cao',
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatter = (value: any, name: any) => {
    if (value == null) return ['-', String(name)];
    return [Number(value).toLocaleString('vi-VN'), LABEL_MAP[String(name)] ?? String(name)];
  };

  return (
    <div className="flex h-full w-full flex-col" style={{ minHeight: 200 }}>
      {/* Title — also serves as drag handle */}
      <div className="chart-drag-handle shrink-0 cursor-grab flex items-center justify-between gap-2 px-3 pt-2 pb-1 active:cursor-grabbing">
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
          <p className="min-w-0 truncate text-xs font-semibold text-[var(--color-text-muted)]">
            📈 Dự báo {targetColumn}
          </p>
        </div>

        {/* ⋯ menu trigger */}
        {widgetId && (
          <div ref={menuRef} className="relative no-print">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex size-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              aria-label="Forecast actions"
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
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10"
                >
                  <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  Xóa dự báo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 25, right: 20, left: 10, bottom: 40 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              angle={-35}
              textAnchor="end"
              height={55}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString('vi-VN')}
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            />
            <Tooltip
              formatter={formatter}
              contentStyle={tooltipStyle}
              itemStyle={{ color: 'var(--color-text)' }}
            />

            {/* Confidence band — Area between lower and upper */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="var(--chart-2, #8884d8)"
              fillOpacity={0.15}
              legendType="none"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="var(--color-surface, #fff)"
              fillOpacity={1}
              legendType="none"
              connectNulls
            />

            {/* Historical line — solid */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="var(--chart-1, #8884d8)"
              strokeWidth={2}
              dot={false}
              connectNulls
              name="actual"
            />

            {/* Forecast line — dashed */}
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--chart-2, #82ca9d)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, fill: 'var(--chart-2, #82ca9d)' }}
              connectNulls
              name="forecast"
            />

            {/* Divider: historical / forecast split */}
            {splitLabel && (
              <ReferenceLine
                x={splitLabel}
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                label={{
                  value: 'Hiện tại',
                  position: 'top',
                  fontSize: 10,
                  fill: 'var(--color-text-muted)',
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer legend */}
      <div className="shrink-0 px-3 pb-2 text-center text-[10px] text-[var(--color-text-faint)]">
        ── Thực tế &nbsp;╌╌ Dự báo &nbsp;░ Khoảng tin cậy 95% ·{' '}
        {result.rowCount.toLocaleString('vi-VN')} hàng được phân tích
      </div>
    </div>
  );
}
