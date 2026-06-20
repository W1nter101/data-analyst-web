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

export interface ChartFilterDef {
  column: string;
  operator: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
  value: string | string[] | number;
}

export type AggregationType = 'sum' | 'avg' | 'count' | 'max' | 'min';
export type OperationType = 'compare' | 'trend' | 'rank' | 'summary';

export interface AnalysisConfig {
  operation: OperationType;
  metric: string;
  group_by: string;
  filters?: ChartFilterDef[];
  aggregation: AggregationType;
}

export interface ChartConfig {
  id: string;
  type: ChartType;
  title: string;
  xColumn: string;
  yColumn: string;
  colorColumn?: string;
  filters?: ChartFilterDef[];
  sortOrder?: 'asc' | 'desc' | 'none';
}

export type WidgetType = 'chart' | 'text' | 'image' | 'table' | 'empty' | 'forecast';

export interface DashboardWidget {
  id: string;
  widgetType: WidgetType;
  chartId?: string;
  textContent?: string;
  imageUrl?: string;
  tableData?: {
    title: string;
    rows: number;
    cols: number;
    cells: string[][]; // 2D array of strings
  };
  forecastResult?: import('@/lib/forecast').ForecastResult;
  layout: { x: number; y: number; w: number; h: number };
}

// ── Auth types ──────────────────────────────────────────────────────

export interface User {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  loading: boolean;

  setAccessToken: (accessToken: string) => void;
  clearState: () => void;

  signUp: (
    username: string,
    password: string,
    email: string,
    firstName: string,
    lastName: string,
  ) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchMe: () => Promise<void>;
  refresh: () => Promise<void>;
}
