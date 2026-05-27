/**
 * anomalyDetector.ts — Pure TypeScript outlier detection.
 *
 * Supports two methods:
 *   - Z-score: flags values with |z| > threshold (default 3)
 *   - IQR: flags values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
 *
 * Zero external dependencies.
 */

export interface AnomalyOutlier {
  rowIndex: number;
  value: number;
  zscore: number;
}

export interface AnomalyStats {
  mean: number;
  std: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
}

export interface AnomalyResult {
  column: string;
  outliers: AnomalyOutlier[];
  stats: AnomalyStats;
  method: 'zscore' | 'iqr';
}

// ── Helpers ──────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values: number[], avg: number): number {
  const variance =
    values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

// ── Main ─────────────────────────────────────────────────────────────

export function detectAnomalies(
  rows: Record<string, string>[],
  numericColumns: string[],
  method: 'zscore' | 'iqr' = 'zscore',
  threshold = 3,
): AnomalyResult[] {
  const results: AnomalyResult[] = [];

  for (const col of numericColumns) {
    // Parse all valid numeric values with their row indices
    const parsed: { index: number; value: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i][col];
      if (raw == null || raw === '') continue;
      const num = Number(raw);
      if (!isNaN(num) && isFinite(num)) {
        parsed.push({ index: i, value: num });
      }
    }

    // Need at least 5 values for meaningful stats
    if (parsed.length < 5) continue;

    const values = parsed.map((p) => p.value);
    const sorted = [...values].sort((a, b) => a - b);

    const avg = mean(values);
    const deviation = std(values, avg);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;

    const stats: AnomalyStats = {
      mean: avg,
      std: deviation,
      q1,
      q3,
      iqr,
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };

    const outliers: AnomalyOutlier[] = [];

    if (method === 'zscore') {
      // Avoid division by zero
      if (deviation === 0) continue;
      for (const p of parsed) {
        const z = (p.value - avg) / deviation;
        if (Math.abs(z) > threshold) {
          outliers.push({
            rowIndex: p.index,
            value: p.value,
            zscore: Math.round(z * 100) / 100,
          });
        }
      }
    } else {
      // IQR method
      const lower = q1 - 1.5 * iqr;
      const upper = q3 + 1.5 * iqr;
      for (const p of parsed) {
        if (p.value < lower || p.value > upper) {
          const z = deviation !== 0 ? (p.value - avg) / deviation : 0;
          outliers.push({
            rowIndex: p.index,
            value: p.value,
            zscore: Math.round(z * 100) / 100,
          });
        }
      }
    }

    if (outliers.length > 0) {
      // Limit to top 20 most extreme outliers (sorted by |zscore| desc)
      outliers.sort((a, b) => Math.abs(b.zscore) - Math.abs(a.zscore));
      results.push({
        column: col,
        outliers: outliers.slice(0, 20),
        stats,
        method,
      });
    }
  }

  return results;
}
