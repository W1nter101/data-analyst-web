/**
 * keyInfluencers.ts — Pearson + Spearman correlation (pure TypeScript)
 *
 * Computes which columns most influence a numeric target column.
 * No external dependencies — deploys anywhere.
 */

export interface InfluencerResult {
  column: string;
  pearson: number;     // -1.00 to 1.00
  spearman: number;    // -1.00 to 1.00
  score: number;       // abs avg of pearson + spearman, 0.00–1.00
  direction: 'positive' | 'negative' | 'neutral';
}

/**
 * Pearson correlation between two numeric arrays of equal length.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num    += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Rank an array of numbers (ties → average rank, 1-based).
 */
function rankArray(arr: number[]): number[] {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(arr.length);

  let j = 0;
  while (j < sorted.length) {
    let k = j;
    // Find extent of ties
    while (k + 1 < sorted.length && sorted[k + 1].v === sorted[j].v) k++;
    const avgRank = (j + k) / 2 + 1; // 1-based average rank for ties
    for (let m = j; m <= k; m++) {
      ranks[sorted[m].i] = avgRank;
    }
    j = k + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation = Pearson applied to ranks.
 */
function spearmanCorrelation(x: number[], y: number[]): number {
  return pearsonCorrelation(rankArray(x), rankArray(y));
}

/**
 * Compute Key Influencers for a target column.
 *
 * @param rows     - Array of row objects from SQLite
 * @param targetColumn - Name of the numeric target column
 * @param allColumns   - All column names in the table
 * @returns Sorted list of up to 10 influencer results (highest score first)
 */
export function computeKeyInfluencers(
  rows: Record<string, string>[],
  targetColumn: string,
  allColumns: string[],
): InfluencerResult[] {
  // Parse target column — skip rows where target is null/NaN
  const targetValues: number[] = [];
  const validIndexes: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const num = parseFloat(String(rows[i][targetColumn] ?? '').replace(/,/g, ''));
    if (isFinite(num)) {
      targetValues.push(num);
      validIndexes.push(i);
    }
  }

  if (targetValues.length < 5) return []; // Not enough data

  const results: InfluencerResult[] = [];
  const featureCols = allColumns.filter(c => c !== targetColumn);

  for (const col of featureCols) {
    const rawVals = validIndexes.map(i => rows[i][col]);
    const numericVals = rawVals.map(v => parseFloat(String(v ?? '').replace(/,/g, '')));
    let featureValues: number[];

    if (numericVals.every(isFinite)) {
      featureValues = numericVals;
    } else {
      // Label encoding for categorical columns
      const uniqueMap = new Map<string, number>();
      let idx = 0;
      featureValues = rawVals.map(v => {
        const key = String(v ?? '');
        if (!uniqueMap.has(key)) uniqueMap.set(key, idx++);
        return uniqueMap.get(key)!;
      });
      // Skip free-text columns (too many unique values relative to row count)
      if (uniqueMap.size > targetValues.length * 0.8) continue;
    }

    const pearson  = pearsonCorrelation(featureValues, targetValues);
    const spearman = spearmanCorrelation(featureValues, targetValues);
    const score    = (Math.abs(pearson) + Math.abs(spearman)) / 2;

    // Skip columns with negligible correlation
    if (score < 0.01) continue;

    const avgSign = (pearson + spearman) / 2;
    results.push({
      column: col,
      pearson,
      spearman,
      score,
      direction: avgSign > 0.05 ? 'positive' : avgSign < -0.05 ? 'negative' : 'neutral',
    });
  }

  // Sort by composite score DESC, return top 10
  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}
