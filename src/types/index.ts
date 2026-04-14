export type ColumnType = 'number' | 'string' | 'date' | 'category' | 'boolean';

export interface ColumnSchema {
  name: string;
  type: ColumnType;
  nullCount: number;
  uniqueCount: number;
  min?: number | string;
  max?: number | string;
  sampleValues: string[];
}

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  schema: ColumnSchema[];
}

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area';

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  xColumn: string;
  yColumn: string;
  colorColumn?: string;
}

export interface DashboardWidget {
  id: string;
  chartId: string;
  layout: { x: number; y: number; w: number; h: number };
}
