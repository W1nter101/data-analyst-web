import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { ChartConfig, DashboardWidget, ParsedCSV } from '@/types';

export type DashboardTab = 'board' | 'data';

// ── Private helper: ensure at least one empty slot exists ──
function ensureEmptySlot(widgets: DashboardWidget[]): DashboardWidget[] {
  const hasEmpty = widgets.some((w) => w.widgetType === 'empty');
  if (hasEmpty) return widgets;

  const bottomY = widgets.reduce(
    (max, w) => Math.max(max, w.layout.y + w.layout.h),
    0,
  );
  return [
    ...widgets,
    {
      id: `empty-${Date.now()}`,
      widgetType: 'empty',
      layout: { x: 0, y: bottomY, w: 6, h: 4 },
    },
  ];
}

export interface AppStoreState {
  csv: ParsedCSV | null;
  charts: ChartConfig[];
  dashboardWidgets: DashboardWidget[];
  isLoading: boolean;
  error: string | null;
  activeTab: DashboardTab;
  focusedWidgetId: string | null;
  editingChartId: string | null;
  pendingChartSlotId: string | null;
  dataTabRows: Record<string, any>[];
  setCSV: (csv: ParsedCSV | null) => void;
  setDataTabRows: (rows: Record<string, any>[]) => void;
  appendDataTabRows: (rows: Record<string, any>[]) => void;
  updateDataTabRow: (rowId: number, column: string, value: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  clearCSV: () => void;
  addChart: (config: ChartConfig) => void;
  removeChart: (id: string) => void;
  updateDashboardLayout: (widgets: DashboardWidget[]) => void;
  clearCharts: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  setFocusedWidgetId: (id: string | null) => void;
  setEditingChartId: (id: string | null) => void;
  updateChart: (id: string, updates: Partial<ChartConfig>) => void;
  addWidget: (widget: DashboardWidget) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => void;
  setPendingChartSlotId: (id: string | null) => void;
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set) => ({
      csv: null,
      charts: [],
      dashboardWidgets: ensureEmptySlot([]),
      isLoading: false,
      error: null,
      activeTab: 'board',
      focusedWidgetId: null,
      editingChartId: null,
      pendingChartSlotId: null,
      dataTabRows: [],
      setCSV: (csv) => set({ csv }),
      setDataTabRows: (dataTabRows) => set({ dataTabRows }),
      appendDataTabRows: (rows) =>
        set((state) => ({ dataTabRows: [...state.dataTabRows, ...rows] })),
      updateDataTabRow: (rowId, column, value) =>
        set((state) => {
          const newRows = [...state.dataTabRows];
          const idx = newRows.findIndex((r) => r.__rowid === rowId);
          if (idx !== -1) {
            newRows[idx] = { ...newRows[idx], [column]: value };
          }
          
          // Also try to update csv.rows if we can, to keep charts somewhat in sync
          let newCsv = state.csv;
          if (state.csv) {
            // Since we cannot assume rowid = index + 1, we must find the row by matching.
            // However, since rowid isn't in csv.rows, we just do our best or leave it.
            // For now, we just update the dataTabRows.
          }
          
          return { dataTabRows: newRows, csv: newCsv };
        }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      clearCSV: () => set({ csv: null, dataTabRows: [] }),
      addChart: (config) =>
        set((state) => ({
          charts: [...state.charts, config],
        })),
      removeChart: (id) =>
        set((state) => ({
          charts: state.charts.filter((chart) => chart.id !== id),
          dashboardWidgets: state.dashboardWidgets.filter(
            (widget) => widget.chartId !== id,
          ),
        })),
      updateDashboardLayout: (dashboardWidgets) => set({ dashboardWidgets }),
      clearCharts: () => set({ charts: [], dashboardWidgets: [] }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setFocusedWidgetId: (focusedWidgetId) => set({ focusedWidgetId }),
      setEditingChartId: (editingChartId) => set({ editingChartId }),
      updateChart: (id, updates) =>
        set((state) => ({
          charts: state.charts.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        })),
      addWidget: (widget) =>
        set((state) => ({
          dashboardWidgets: ensureEmptySlot([...state.dashboardWidgets, widget]),
        })),
      removeWidget: (widgetId) =>
        set((state) => ({
          dashboardWidgets: ensureEmptySlot(
            state.dashboardWidgets.filter((w) => w.id !== widgetId),
          ),
        })),
      updateWidget: (widgetId, updates) =>
        set((state) => ({
          dashboardWidgets: ensureEmptySlot(
            state.dashboardWidgets.map((w) =>
              w.id === widgetId ? { ...w, ...updates } : w,
            ),
          ),
        })),
      setPendingChartSlotId: (pendingChartSlotId) =>
        set({ pendingChartSlotId }),
    }),
    {
      name: 'csv-analyst-store',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        csv: state.csv,
        charts: state.charts,
        dashboardWidgets: state.dashboardWidgets,
      }),
      // Migration: treat missing widgetType as 'chart'
      merge: (persisted, current) => {
        const p = persisted as Partial<AppStoreState> | undefined;
        if (!p) return current;
        const migratedWidgets = (p.dashboardWidgets ?? []).map((w) => ({
          ...w,
          widgetType: w.widgetType ?? ('chart' as const),
        }));
        return {
          ...current,
          ...p,
          dashboardWidgets: ensureEmptySlot(migratedWidgets),
        };
      },
    },
  ),
);
