'use client';

import { useMemo } from 'react';

import { useCSVData } from '@/hooks/useCSVData';
import type { ColumnSchema, ColumnType } from '@/types';

const TOP_LIMIT = 5;
const SAMPLE_CHIP_LIMIT = 5;

function typeBadgeClasses(type: ColumnType): string {
  const base =
    'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize';
  switch (type) {
    case 'number':
      return `${base} bg-[var(--color-accent)]/20 text-[var(--color-accent)]`;
    case 'date':
      return `${base} bg-[var(--chart-5)]/20 text-[var(--chart-5)]`;
    case 'category':
      return `${base} bg-[var(--color-success)]/20 text-[var(--color-success)]`;
    case 'boolean':
      return `${base} bg-[var(--color-warning)]/20 text-[var(--color-warning)]`;
    case 'string':
    default:
      return `${base} bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]`;
  }
}

function nullPercent(nullCount: number, rowCount: number): string {
  if (rowCount <= 0) return '0';
  return ((nullCount / rowCount) * 100).toFixed(1);
}

function topFrequentValues(
  rows: Record<string, string>[],
  columnName: string,
  limit: number,
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[columnName] ?? '';
    if (raw.trim() === '') continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function formatMinMaxNumber(min: number | undefined, max: number | undefined): {
  min: string;
  max: string;
} {
  if (typeof min !== 'number' || typeof max !== 'number') {
    return { min: '—', max: '—' };
  }
  return {
    min: min.toLocaleString(),
    max: max.toLocaleString(),
  };
}

function StatsSkeletonCards() {
  return (
    <div className="flex w-full gap-4 overflow-x-auto pb-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="min-w-[260px] max-w-[280px] shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
        >
          <div className="mb-3 h-5 w-3/4 animate-pulse rounded bg-[var(--color-surface)]" />
          <div className="mb-4 h-6 w-20 animate-pulse rounded-full bg-[var(--color-surface)]" />
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-[var(--color-surface)]" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-[var(--color-surface)]" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--color-surface)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnCard({
  col,
  rowCount,
  topValues,
}: {
  col: ColumnSchema;
  rowCount: number;
  topValues: { value: string; count: number }[];
}) {
  const samples = col.sampleValues.slice(0, SAMPLE_CHIP_LIMIT);
  const { min: numMin, max: numMax } = formatMinMaxNumber(
    typeof col.min === 'number' ? col.min : undefined,
    typeof col.max === 'number' ? col.max : undefined,
  );

  return (
    <article
      className="min-w-[260px] max-w-[280px] shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 shadow-sm"
      aria-labelledby={`col-stats-${col.name}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3
          id={`col-stats-${col.name}`}
          className="min-w-0 wrap-break-word text-sm font-semibold text-[var(--color-text)]"
          title={col.name}
        >
          {col.name}
        </h3>
        <span className={typeBadgeClasses(col.type)}>{col.type}</span>
      </div>

      <dl className="space-y-2 text-xs text-[var(--color-text-muted)] font-[family-name:var(--font-mono)]">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-text-muted)]">Nulls</dt>
          <dd className="text-right font-medium text-[var(--color-text)]">
            {col.nullCount.toLocaleString()} ({nullPercent(col.nullCount, rowCount)}%)
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-text-muted)]">Unique</dt>
          <dd className="text-right font-medium text-[var(--color-text)]">
            {col.uniqueCount.toLocaleString()}
          </dd>
        </div>

        {col.type === 'number' ? (
          <div className="border-t border-[var(--color-border)] pt-2">
            <p className="mb-1 text-[var(--color-text-muted)]">Range</p>
            <p className="font-mono text-[11px] text-[var(--color-text)]">
              min {numMin} · max {numMax}
            </p>
          </div>
        ) : null}

        {col.type === 'date' ? (
          <div className="border-t border-[var(--color-border)] pt-2">
            <p className="mb-1 text-[var(--color-text-muted)]">Date range</p>
            <p className="wrap-break-word font-mono text-[11px] text-[var(--color-text)]">
              <span className="block">Earliest: {col.min != null ? String(col.min) : '—'}</span>
              <span className="block">Latest: {col.max != null ? String(col.max) : '—'}</span>
            </p>
          </div>
        ) : null}

        {col.type === 'category' ? (
          <div className="border-t border-[var(--color-border)] pt-2">
            <p className="mb-1 text-[var(--color-text-muted)]">Top {TOP_LIMIT} values</p>
            {topValues.length === 0 ? (
              <p className="text-[var(--color-text-faint)]">No non-null values</p>
            ) : (
              <ul className="space-y-1">
                {topValues.map(({ value, count }, idx) => (
                  <li
                    key={`${col.name}-freq-${idx}`}
                    className="flex justify-between gap-2 font-mono text-[11px] text-[var(--color-text)]"
                  >
                    <span className="min-w-0 truncate" title={value}>
                      {value}
                    </span>
                    <span className="shrink-0 text-[var(--color-text-muted)]">
                      {count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {samples.length > 0 ? (
          <div className="border-t border-[var(--color-border)] pt-2">
            <p className="mb-1.5 text-[var(--color-text-muted)]">Samples</p>
            <div className="flex flex-wrap gap-1">
              {samples.map((v, i) => (
                <span
                  key={`${col.name}-sample-${i}`}
                  className="max-w-full truncate rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text)]"
                  title={v}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

export function ColumnStats() {
  const { csv, isLoading } = useCSVData();

  const topByColumn = useMemo(() => {
    if (!csv) return new Map<string, { value: string; count: number }[]>();
    const map = new Map<string, { value: string; count: number }[]>();
    for (const col of csv.schema) {
      if (col.type !== 'category') continue;
      map.set(col.name, topFrequentValues(csv.rows, col.name, TOP_LIMIT));
    }
    return map;
  }, [csv]);

  if (!csv && !isLoading) {
    return null;
  }

  if (isLoading) {
    return <StatsSkeletonCards />;
  }

  if (!csv) {
    return null;
  }

  const { schema, rowCount } = csv;

  return (
    <section className="w-full" aria-label="Column statistics">
      <div className="flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin]">
        {schema.map((col) => (
          <ColumnCard
            key={col.name}
            col={col}
            rowCount={rowCount}
            topValues={topByColumn.get(col.name) ?? []}
          />
        ))}
      </div>
    </section>
  );
}
