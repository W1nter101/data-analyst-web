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
      return `${base} bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200`;
    case 'date':
      return `${base} bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200`;
    case 'category':
      return `${base} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200`;
    case 'boolean':
      return `${base} bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200`;
    case 'string':
    default:
      return `${base} bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100`;
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
          className="min-w-[260px] max-w-[280px] shrink-0 rounded-xl border border-black/10 bg-black/2 p-4 dark:border-white/15 dark:bg-white/4"
        >
          <div className="mb-3 h-5 w-3/4 animate-pulse rounded bg-black/10 dark:bg-white/15" />
          <div className="mb-4 h-6 w-20 animate-pulse rounded-full bg-black/10 dark:bg-white/15" />
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10" />
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
      className="min-w-[260px] max-w-[280px] shrink-0 rounded-xl border border-black/10 bg-black/2 p-4 shadow-sm dark:border-white/15 dark:bg-white/4"
      aria-labelledby={`col-stats-${col.name}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3
          id={`col-stats-${col.name}`}
          className="min-w-0 wrap-break-word text-sm font-semibold text-foreground"
          title={col.name}
        >
          {col.name}
        </h3>
        <span className={typeBadgeClasses(col.type)}>{col.type}</span>
      </div>

      <dl className="space-y-2 text-xs text-foreground/80">
        <div className="flex justify-between gap-2">
          <dt className="text-foreground/60">Nulls</dt>
          <dd className="text-right font-medium text-foreground">
            {col.nullCount.toLocaleString()} ({nullPercent(col.nullCount, rowCount)}%)
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-foreground/60">Unique</dt>
          <dd className="text-right font-medium text-foreground">
            {col.uniqueCount.toLocaleString()}
          </dd>
        </div>

        {col.type === 'number' ? (
          <div className="border-t border-black/10 pt-2 dark:border-white/10">
            <p className="mb-1 text-foreground/60">Range</p>
            <p className="font-mono text-[11px] text-foreground">
              min {numMin} · max {numMax}
            </p>
          </div>
        ) : null}

        {col.type === 'date' ? (
          <div className="border-t border-black/10 pt-2 dark:border-white/10">
            <p className="mb-1 text-foreground/60">Date range</p>
            <p className="wrap-break-word font-mono text-[11px] text-foreground">
              <span className="block">Earliest: {col.min != null ? String(col.min) : '—'}</span>
              <span className="block">Latest: {col.max != null ? String(col.max) : '—'}</span>
            </p>
          </div>
        ) : null}

        {col.type === 'category' ? (
          <div className="border-t border-black/10 pt-2 dark:border-white/10">
            <p className="mb-1 text-foreground/60">Top {TOP_LIMIT} values</p>
            {topValues.length === 0 ? (
              <p className="text-foreground/50">No non-null values</p>
            ) : (
              <ul className="space-y-1">
                {topValues.map(({ value, count }, idx) => (
                  <li
                    key={`${col.name}-freq-${idx}`}
                    className="flex justify-between gap-2 font-mono text-[11px] text-foreground"
                  >
                    <span className="min-w-0 truncate" title={value}>
                      {value}
                    </span>
                    <span className="shrink-0 text-foreground/70">
                      {count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {samples.length > 0 ? (
          <div className="border-t border-black/10 pt-2 dark:border-white/10">
            <p className="mb-1.5 text-foreground/60">Samples</p>
            <div className="flex flex-wrap gap-1">
              {samples.map((v, i) => (
                <span
                  key={`${col.name}-sample-${i}`}
                  className="max-w-full truncate rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] text-foreground/90 dark:bg-white/10"
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
