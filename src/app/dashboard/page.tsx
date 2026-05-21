'use client';

import { ChartPicker } from '@/components/chart/ChartPicker';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { DataView } from '@/components/data/DataView';
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
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <DashboardTabs />

      {activeTab === 'board' ? (
        /* ── Board tab (original content, unchanged) ──────── */
        <div className="flex flex-col gap-8">
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
        </div>
      ) : (
        /* ── Data tab ─────────────────────────────────────── */
        <DataView />
      )}
    </div>
  );
}

