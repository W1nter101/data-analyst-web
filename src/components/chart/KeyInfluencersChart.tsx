'use client';

export interface InfluencerResult {
  column: string;
  pearson: number;
  spearman: number;
  score: number;
  direction: 'positive' | 'negative' | 'neutral';
}

interface KeyInfluencersChartProps {
  results: InfluencerResult[];
  targetColumn: string;
  rowCount: number;
}

const DIRECTION_COLOR: Record<string, string> = {
  positive: 'var(--color-success)',
  negative: 'var(--color-error)',
  neutral:  'var(--color-text-faint)',
};

const DIRECTION_ARROW: Record<string, string> = {
  positive: '↑',
  negative: '↓',
  neutral:  '~',
};

export function KeyInfluencersChart({ results, targetColumn, rowCount }: KeyInfluencersChartProps) {
  const maxScore = results[0]?.score ?? 1;

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Key Influencers →{' '}
        <span className="text-[var(--color-text)]">{targetColumn}</span>
      </p>

      {results.map((r) => {
        const barPct = Math.round((r.score / maxScore) * 100); // Only used for bar width
        const color  = DIRECTION_COLOR[r.direction];
        const arrow  = DIRECTION_ARROW[r.direction];
        // Tooltip shows raw Pearson/Spearman values for deeper understanding
        const tooltip = `Pearson: ${r.pearson.toFixed(2)}, Spearman: ${r.spearman.toFixed(2)}`;

        return (
          <div key={r.column} className="flex items-center gap-2" title={tooltip}>
            <span className="w-28 shrink-0 truncate text-right text-xs text-[var(--color-text)]">
              {r.column}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-offset)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barPct}%`, backgroundColor: color }}
              />
            </div>
            {/* Display absolute score 0.00–1.00, not relative % */}
            <span className="w-14 shrink-0 text-right font-mono text-xs" style={{ color }}>
              {arrow} {r.score.toFixed(2)}
            </span>
          </div>
        );
      })}

      <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
        Score 0.00–1.00 · ↑ tỷ lệ thuận · ↓ tỷ lệ nghịch · hover để xem Pearson/Spearman
        · {rowCount.toLocaleString()} hàng được phân tích
      </p>
    </div>
  );
}
