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
