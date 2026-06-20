'use client';

import { useRef, useEffect } from 'react';
import { ChartPicker } from '@/components/chart/ChartPicker';
import { DashboardGrid } from '@/components/dashboard/DashboardGrid';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { DataView } from '@/components/data/DataView';
import { ColumnStats } from '@/components/table/ColumnStats';
import { DataTable } from '@/components/table/DataTable';
import { TableToolbar } from '@/components/table/TableToolbar';
import { CSVUploader } from '@/components/upload/CSVUploader';
import { FileSelector } from '@/components/FileSelector';
import { useCSVData } from '@/hooks/useCSVData';
import { useAppStore } from '@/store/appStore';
import { useExportPDF } from '@/hooks/useExportPDF';
import { toast } from 'sonner';
import { NotebookPanel } from '@/components/notebook/NotebookPanel';

export default function DashboardPage() {
  const { csv } = useCSVData();
  const dashboardWidgets = useAppStore((s) => s.dashboardWidgets);
  const clearCharts = useAppStore((s) => s.clearCharts);
  const activeTab = useAppStore((s) => s.activeTab);

  const boardRef = useRef<HTMLDivElement>(null);
  const { exportToPDF } = useExportPDF();

  useEffect(() => {
    const handleTrigger = async () => {
      // Check if there are non-empty widgets on the board
      const nonArr = dashboardWidgets.filter((w) => w.widgetType !== 'empty');
      if (nonArr.length === 0) {
        toast.warning('Không có nội dung để xuất');
        return;
      }

      window.dispatchEvent(new CustomEvent('pdf-export-start'));
      const fileName = `dashboard-${new Date().toISOString().split('T')[0]}.pdf`;
      try {
        await exportToPDF(boardRef, {
          filename: fileName,
        });
        toast.success('Đã xuất PDF thành công!');
      } catch (err) {
        console.error('[pdf-export] error:', err);
        toast.error('Không thể xuất PDF. Vui lòng thử lại.');
      } finally {
        window.dispatchEvent(new CustomEvent('pdf-export-end'));
      }
    };

    window.addEventListener('trigger-pdf-export', handleTrigger);
    return () => {
      window.removeEventListener('trigger-pdf-export', handleTrigger);
    };
  }, [exportToPDF, dashboardWidgets]);


  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <DashboardTabs />

      {activeTab === 'board' ? (
        /* ── Board tab (original content, unchanged) ──────── */
        <div className="flex flex-col gap-8">
          <section aria-label="Upload CSV">
            <CSVUploader />
            <div className="mt-6">
              <FileSelector />
            </div>
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
                    className="text-lg font-semibold text-[var(--color-text)]"
                  >
                    Data Table
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)]">
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
              className="mb-3 text-lg font-semibold text-[var(--color-text)]"
            >
              Chart Builder
            </h2>
            <ChartPicker />
          </section>

          <section aria-labelledby="dashboard-heading" className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="dashboard-heading" className="text-lg font-semibold text-[var(--color-text)]">
                Dashboard
              </h2>
              {dashboardWidgets.length > 0 ? (
                <button
                  type="button"
                  onClick={clearCharts}
                  className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  Clear all charts
                </button>
              ) : null}
            </div>
            <div
              ref={boardRef}
              className="w-full min-h-full overflow-visible p-4 rounded-xl transition-colors duration-150 hover:bg-white/[0.02]"
              style={{
                height: 'fit-content',
                position: 'relative',
              }}
            >
              <DashboardGrid />
            </div>
          </section>
        </div>
      ) : activeTab === 'data' ? (
        /* ── Data tab ─────────────────────────────────────── */
        <DataView />
      ) : (
        /* ── Notebook tab ─────────────────────────────────── */
        <NotebookPanel />
      )}
    </div>
  );
}

