import Papa from 'papaparse';

import type { ParsedCSV } from '@/types';

import { buildColumnSchemas } from './schema';

function normalizeRows(
  headers: string[],
  rawRows: Record<string, unknown>[],
): Record<string, string>[] {
  return rawRows.map((row) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = row[h];
      out[h] = v == null ? '' : String(v);
    }
    return out;
  });
}

/**
 * Parses CSV text with PapaParse (client-side), normalizes rows to string records per header,
 * then builds schema via phase1 detection rules.
 */
export function parseCSV(csvText: string): ParsedCSV {
  const result = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    dynamicTyping: false,
  });

  const fields = result.meta.fields?.filter((f) => f.length > 0) ?? [];
  const headers = fields.length > 0 ? fields : [];

  const data = Array.isArray(result.data) ? result.data : [];
  const rows = normalizeRows(headers, data);

  const schema = buildColumnSchemas(headers, rows);

  return {
    headers,
    rows,
    rowCount: rows.length,
    schema,
  };
}

/**
 * Reads a file as text and returns {@link ParsedCSV}.
 */
export async function parseCSVFile(file: File): Promise<ParsedCSV> {
  const text = await file.text();
  return parseCSV(text);
}
