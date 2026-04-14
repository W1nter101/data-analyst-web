import { create } from 'zustand';

import type { ChartConfig, DashboardWidget, ParsedCSV } from '@/types';

export interface AppStoreState {
  csv: ParsedCSV | null;
  charts: ChartConfig[];
  dashboardWidgets: DashboardWidget[];
  isLoading: boolean;
  error: string | null;
  setCSV: (csv: ParsedCSV | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  clearCSV: () => void;
  addChart: (config: ChartConfig) => void;
  removeChart: (id: string) => void;
  updateDashboardLayout: (widgets: DashboardWidget[]) => void;
  clearCharts: () => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  csv: null,
  charts: [],
  dashboardWidgets: [],
  isLoading: false,
  error: null,
  setCSV: (csv) => set({ csv }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearCSV: () => set({ csv: null }),
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
}));
