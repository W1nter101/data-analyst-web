/**
 * forecast.ts — Pure TypeScript time-series forecasting.
 *
 * Uses Holt's Double Exponential Smoothing (no external dependencies).
 * Called from /api/forecast route — never from client.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface ForecastInput {
  dateColumn: string;
  valueColumn: string;
  horizon: number;
  rows: Record<string, unknown>[];
}

export interface ForecastPoint {
  label: string;
  value: number;
  lower: number;
  upper: number;
  isForecast: true;
}

export interface HistoricalPoint {
  label: string;
  value: number;
  isForecast: false;
}

export type DateGranularity = 'day' | 'month' | 'year' | 'unknown';

export interface ForecastResult {
  historical: HistoricalPoint[];
  forecast: ForecastPoint[];
  trend: 'up' | 'down' | 'flat';
  trendPct: number;
  dateGranularity: DateGranularity;
  targetColumn: string;
  dateColumn: string;
  rowCount: number;
  error?: string;
}

// ── Date parsing ──────────────────────────────────────────────────────

/** Try multiple date formats, return Date or null. */
function tryParseDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 1. Native Date parse (ISO, "YYYY-MM-DD", "Mon DD YYYY", etc.)
  const native = new Date(s);
  if (!isNaN(native.getTime()) && native.getFullYear() > 1900) return native;

  // 2. "MM/YYYY" or "M/YYYY"
  const mmYYYY = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYYYY) {
    const d = new Date(Number(mmYYYY[2]), Number(mmYYYY[1]) - 1, 1);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. "dd/MM/yyyy"
  const ddMMyyyySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMMyyyySlash) {
    const day = Number(ddMMyyyySlash[1]);
    const month = Number(ddMMyyyySlash[2]);
    const year = Number(ddMMyyyySlash[3]);
    // If day > 12, it's definitely dd/MM/yyyy
    if (day > 12) {
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) return d;
    }
    // If month > 12, it's MM/dd/yyyy
    if (month > 12) {
      const d = new Date(year, day - 1, month);
      if (!isNaN(d.getTime())) return d;
    }
    // Ambiguous — default to dd/MM/yyyy
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. "dd-MM-yyyy"
  const ddMMyyyyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyyDash) {
    const day = Number(ddMMyyyyDash[1]);
    const month = Number(ddMMyyyyDash[2]);
    const year = Number(ddMMyyyyDash[3]);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

// ── Granularity detection ─────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function detectGranularity(dates: Date[]): DateGranularity {
  if (dates.length < 3) return 'unknown';

  // Average gap in days
  let totalGapMs = 0;
  for (let i = 1; i < dates.length; i++) {
    totalGapMs += dates[i].getTime() - dates[i - 1].getTime();
  }
  const avgGapDays = totalGapMs / (dates.length - 1) / MS_PER_DAY;

  if (avgGapDays >= 1 && avgGapDays <= 2) return 'day';
  if (avgGapDays > 6 && avgGapDays <= 14) return 'day';   // weekly-ish → treat as day
  if (avgGapDays >= 25 && avgGapDays <= 35) return 'month';
  if (avgGapDays >= 350) return 'year';

  // Fallback
  if (avgGapDays < 35) return 'day';
  if (avgGapDays < 400) return 'month';
  return 'year';
}

// ── Period key helpers ────────────────────────────────────────────────

function periodKey(date: Date, gran: DateGranularity): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  switch (gran) {
    case 'month': return `${y}-${m}`;
    case 'year':  return `${y}`;
    case 'day':   return `${y}-${m}-${d}`;
    default:      return date.toISOString().slice(0, 10);
  }
}

function displayLabel(key: string, gran: DateGranularity): string {
  switch (gran) {
    case 'month': {
      const [y, m] = key.split('-');
      return `Th${Number(m)}/${y}`;
    }
    case 'year':
      return key;
    case 'day': {
      const parts = key.split('-');
      return `${parts[2]}/${parts[1]}`;
    }
    default:
      return key;
  }
}

/** Generate N future period keys starting after lastKey. */
function nextPeriodKeys(lastKey: string, gran: DateGranularity, count: number): string[] {
  const keys: string[] = [];

  if (gran === 'month') {
    const [y, m] = lastKey.split('-').map(Number);
    let year = y;
    let month = m;
    for (let i = 0; i < count; i++) {
      month++;
      if (month > 12) { month = 1; year++; }
      keys.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  } else if (gran === 'year') {
    let year = Number(lastKey);
    for (let i = 0; i < count; i++) {
      year++;
      keys.push(`${year}`);
    }
  } else {
    // day or unknown — add days
    const parts = lastKey.split('-').map(Number);
    const base = new Date(parts[0], parts[1] - 1, parts[2] || 1);
    for (let i = 1; i <= count; i++) {
      const next = new Date(base.getTime() + i * MS_PER_DAY);
      const y = next.getFullYear();
      const m = String(next.getMonth() + 1).padStart(2, '0');
      const d = String(next.getDate()).padStart(2, '0');
      keys.push(`${y}-${m}-${d}`);
    }
  }

  return keys;
}

// ── Main function ─────────────────────────────────────────────────────

export function computeForecast(input: ForecastInput): ForecastResult {
  const { dateColumn, valueColumn, horizon, rows } = input;

  const emptyResult: Omit<ForecastResult, 'error'> = {
    historical: [],
    forecast: [],
    trend: 'flat',
    trendPct: 0,
    dateGranularity: 'unknown',
    targetColumn: valueColumn,
    dateColumn,
    rowCount: rows.length,
  };

  // ── Step A: Parse & sort dates ──────────────────────────────────

  const parsed: { date: Date; value: number }[] = [];

  for (const row of rows) {
    const dateRaw = row[dateColumn];
    const valRaw = row[valueColumn];

    const date = tryParseDate(dateRaw);
    if (!date) continue;

    const value = Number(String(valRaw).replace(/,/g, ''));
    if (isNaN(value)) continue;

    parsed.push({ date, value });
  }

  if (parsed.length === 0) {
    return {
      ...emptyResult,
      error: 'Không có dữ liệu số hợp lệ trong cột đã chọn',
    };
  }

  // Sort ascending by date
  parsed.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── Step B: Detect granularity & aggregate ──────────────────────

  const dates = parsed.map((p) => p.date);
  const dateGranularity = detectGranularity(dates);

  // Group by period key
  const aggregated = new Map<string, number>();
  for (const { date, value } of parsed) {
    const key = periodKey(date, dateGranularity);
    aggregated.set(key, (aggregated.get(key) ?? 0) + value);
  }

  // Convert to sorted arrays
  const sortedKeys = Array.from(aggregated.keys()).sort();
  const values = sortedKeys.map((k) => aggregated.get(k)!);

  // ── Step C: Validate ────────────────────────────────────────────

  if (values.length < 6) {
    return {
      ...emptyResult,
      dateGranularity,
      error: 'Cần ít nhất 6 kỳ dữ liệu để tạo dự báo chính xác',
    };
  }

  // Clamp horizon
  const clampedHorizon = Math.max(1, Math.min(12, Math.floor(values.length / 2), horizon));

  // ── Step D: Holt's Double Exponential Smoothing ─────────────────

  const ALPHA = 0.3; // level smoothing
  const BETA = 0.1;  // trend smoothing

  let L = values[0];
  let B = values[1] - values[0];

  const fitted: number[] = [];

  for (let t = 1; t < values.length; t++) {
    const prevL = L;
    L = ALPHA * values[t] + (1 - ALPHA) * (L + B);
    B = BETA * (L - prevL) + (1 - BETA) * B;
    fitted.push(L + B);
  }

  // Residuals & standard deviation
  const residuals = values.slice(1).map((v, i) => v - fitted[i]);
  const meanRes = residuals.reduce((s, r) => s + r, 0) / residuals.length;
  const sigma = Math.sqrt(
    residuals.reduce((s, r) => s + (r - meanRes) ** 2, 0) / residuals.length,
  );

  // Forecast h steps ahead
  const forecastRaw: { value: number; lower: number; upper: number }[] = [];
  for (let h = 1; h <= clampedHorizon; h++) {
    const fVal = L + h * B;
    const ciWidth = 1.96 * sigma * Math.sqrt(h);
    forecastRaw.push({ value: fVal, lower: fVal - ciWidth, upper: fVal + ciWidth });
  }

  // ── Step E: Generate labels ─────────────────────────────────────

  const lastKey = sortedKeys[sortedKeys.length - 1];
  const futureKeys = nextPeriodKeys(lastKey, dateGranularity, clampedHorizon);

  // Build historical points
  const historical: HistoricalPoint[] = sortedKeys.map((key, i) => ({
    label: displayLabel(key, dateGranularity),
    value: values[i],
    isForecast: false as const,
  }));

  // Build forecast points
  const forecast: ForecastPoint[] = futureKeys.map((key, i) => ({
    label: displayLabel(key, dateGranularity),
    value: Math.round(forecastRaw[i].value),
    lower: Math.round(forecastRaw[i].lower),
    upper: Math.round(forecastRaw[i].upper),
    isForecast: true as const,
  }));

  // ── Step F: Trend ───────────────────────────────────────────────

  const firstActual = values[0];
  const lastForecastValue = forecastRaw[forecastRaw.length - 1].value;
  const trendPct =
    Math.abs(firstActual) < 0.0001
      ? 0
      : ((lastForecastValue - firstActual) / Math.abs(firstActual)) * 100;

  const trend: 'up' | 'down' | 'flat' =
    Math.abs(trendPct) < 2 ? 'flat' : trendPct > 0 ? 'up' : 'down';

  return {
    historical,
    forecast,
    trend,
    trendPct: Math.round(trendPct * 10) / 10,
    dateGranularity,
    targetColumn: valueColumn,
    dateColumn,
    rowCount: rows.length,
  };
}
