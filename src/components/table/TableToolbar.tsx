'use client';

import { useCSVData } from '@/hooks/useCSVData';

export function TableToolbar() {
  const { csv, clearData } = useCSVData();

  if (!csv) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-black/2 px-4 py-3 text-sm dark:border-white/15 dark:bg-white/4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-foreground/80">
        <span>
          <span className="font-medium text-foreground">Total rows:</span>{' '}
          {csv.rowCount.toLocaleString()}
        </span>
        <span>
          <span className="font-medium text-foreground">Columns:</span>{' '}
          {csv.headers.length.toLocaleString()}
        </span>
      </div>
      <button
        type="button"
        onClick={clearData}
        className="rounded-md border border-black/15 bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Clear data
      </button>
    </div>
  );
}
