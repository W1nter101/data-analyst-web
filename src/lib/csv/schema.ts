import type { ColumnSchema, ColumnType } from '@/types';

const SAMPLE_LIMIT = 10;

function isNullCell(raw: string): boolean {
  return raw.trim() === '';
}

/** Strip commas before numeric parse (phase1 edge case). */
function stripCommas(s: string): string {
  return s.replace(/,/g, '');
}

function parsesAsFloat(nonNullValue: string): boolean {
  const cleaned = stripCommas(nonNullValue).trim();
  if (cleaned === '') return false;
  const n = Number(cleaned);
  return Number.isFinite(n);
}

function parsesAsValidDate(nonNullValue: string): boolean {
  const t = Date.parse(nonNullValue.trim());
  return !Number.isNaN(t);
}

/**
 * Phase 1 rules (docs/features/phase1-csv-upload-table.md), in order:
 * - If >80% of non-null values parse as float → 'number'
 * - If >80% parse as valid date (Date.parse) → 'date'
 * - If unique count / total < 0.1 AND total > 10 → 'category'
 * - Otherwise → 'string'
 */
function detectColumnType(nonNullValues: string[], uniqueCount: number): ColumnType {
  const total = nonNullValues.length;
  if (total === 0) {
    return 'string';
  }

  const floatOk = nonNullValues.filter(parsesAsFloat).length;
  if (floatOk / total > 0.8) {
    return 'number';
  }

  const dateOk = nonNullValues.filter(parsesAsValidDate).length;
  if (dateOk / total > 0.8) {
    return 'date';
  }

  if (uniqueCount / total < 0.1 && total > 10) {
    return 'category';
  }

  return 'string';
}

function numericMinMax(values: string[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    const n = Number(stripCommas(v).trim());
    if (!Number.isFinite(n)) continue;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  if (min === Infinity) {
    return { min: 0, max: 0 };
  }
  return { min, max };
}

function dateMinMax(values: string[]): { min: string; max: string } {
  let minTs = Infinity;
  let maxTs = -Infinity;
  let minRaw = '';
  let maxRaw = '';
  for (const v of values) {
    const ts = Date.parse(v.trim());
    if (Number.isNaN(ts)) continue;
    if (ts < minTs) {
      minTs = ts;
      minRaw = v.trim();
    }
    if (ts > maxTs) {
      maxTs = ts;
      maxRaw = v.trim();
    }
  }
  if (minTs === Infinity) {
    return { min: '', max: '' };
  }
  return { min: minRaw, max: maxRaw };
}

/**
 * Builds per-column schema: type (phase1 rules), null/unique counts, min/max when applicable, samples.
 */
export function buildColumnSchemas(
  headers: string[],
  rows: Record<string, string>[],
): ColumnSchema[] {
  return headers.map((name) => {
    const rawValues = rows.map((row) => row[name] ?? '');
    const nullCount = rawValues.filter(isNullCell).length;
    const nonNullRaw = rawValues.filter((v) => !isNullCell(v));
    const uniqueSet = new Set(nonNullRaw);
    const uniqueCount = uniqueSet.size;

    const type = detectColumnType(nonNullRaw, uniqueCount);

    const sampleValues: string[] = [];
    for (const v of nonNullRaw) {
      if (sampleValues.length >= SAMPLE_LIMIT) break;
      if (!sampleValues.includes(v)) {
        sampleValues.push(v);
      }
    }

    const base: ColumnSchema = {
      name,
      type,
      nullCount,
      uniqueCount,
      sampleValues,
    };

    if (type === 'number' && nonNullRaw.length > 0) {
      const { min, max } = numericMinMax(nonNullRaw);
      return { ...base, min, max };
    }

    if (type === 'date' && nonNullRaw.length > 0) {
      const { min, max } = dateMinMax(nonNullRaw);
      if (min !== '' && max !== '') {
        return { ...base, min, max };
      }
    }

    return base;
  });
}
