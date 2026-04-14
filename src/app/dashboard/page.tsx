'use client';

import { ChartPicker } from '@/components/chart/ChartPicker';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { ColumnStats } from '@/components/table/ColumnStats';
import { DataTable } from '@/components/table/DataTable';
import { TableToolbar } from '@/components/table/TableToolbar';
import { CSVUploader } from '@/components/upload/CSVUploader';
import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';

export default function DashboardPage() {
  const { csv } = useCSVData();
  const dashboardWidgets = useAppStore((s) => s.dashboardWidgets);
  const clearCharts = useAppStore((s) => s.clearCharts);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-black/10 bg-background px-4 py-4 dark:border-white/15 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">CSV Analyst</h1>
          <p className="max-w-xl text-sm text-foreground/65 sm:ml-auto sm:text-right">
            Upload a CSV, inspect column stats, and explore your data in the table below.
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <section aria-label="Upload CSV">
          <CSVUploader />
        </section>

        {csv ? (
          <div className="flex flex-col gap-6">
            <div className="min-w-0">
              <ColumnStats />
            </div>

            <section aria-labelledby="data-table-heading" className="min-w-0">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="data-table-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  Data Table
                </h2>
                <p className="text-sm text-foreground/65">
                  {csv.rowCount.toLocaleString()} row
                  {csv.rowCount === 1 ? '' : 's'}
                </p>
              </div>
              <TableToolbar />
              <DataTable />
            </section>
          </div>
        ) : null}

        <section aria-labelledby="chart-builder-heading" className="min-w-0">
          <h2
            id="chart-builder-heading"
            className="mb-3 text-lg font-semibold text-foreground"
          >
            Chart Builder
          </h2>
          <ChartPicker />
        </section>

        <section aria-labelledby="dashboard-heading" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="dashboard-heading" className="text-lg font-semibold text-foreground">
              Dashboard
            </h2>
            {dashboardWidgets.length > 0 ? (
              <button
                type="button"
                onClick={clearCharts}
                className="rounded-md border border-black/15 bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Clear all charts
              </button>
            ) : null}
          </div>
          <DashboardGrid />
        </section>
      </main>
    </div>
  );
}
