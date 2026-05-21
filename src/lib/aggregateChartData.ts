import type { ChartConfig } from '@/types';

/**
 * Aggregates raw CSV rows based on a ChartConfig.
 *
 * Groups rows by config.xColumn (+ config.colorColumn if present),
 * sums parseFloat(row[config.yColumn]) per group (skipping NaN),
 * and returns the result sorted by yColumn value descending.
 *
 * Output uses original column names as keys:
 *   { [config.xColumn]: string, [config.colorColumn]?: string, [config.yColumn]: number }
 */
export function aggregateChartData(
  rows: Record<string, string>[],
  config: ChartConfig,
): Record<string, string | number>[] {
  const { xColumn, yColumn, colorColumn } = config;
  const groups = new Map<string, number>();

  for (const row of rows) {
    const xRaw = row[xColumn];
    const yRaw = row[yColumn];
    if (xRaw == null || yRaw == null) continue;

    const y = parseFloat(yRaw.replace(/,/g, ''));
    if (Number.isNaN(y)) continue;

    const groupKey = colorColumn && row[colorColumn] != null
      ? `${xRaw}\x00${row[colorColumn]}`
      : xRaw;

    groups.set(groupKey, (groups.get(groupKey) || 0) + y);
  }

  const result: Record<string, string | number>[] = [];

  for (const [key, sum] of groups.entries()) {
    if (colorColumn) {
      const [x, group] = key.split('\x00');
      result.push({ [xColumn]: x, [colorColumn]: group, [yColumn]: sum });
    } else {
      result.push({ [xColumn]: key, [yColumn]: sum });
    }
  }

  // Sort by yColumn descending
  result.sort((a, b) => (b[yColumn] as number) - (a[yColumn] as number));

  return result;
}
