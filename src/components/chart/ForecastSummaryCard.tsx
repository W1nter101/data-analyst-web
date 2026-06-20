'use client';

import type { ForecastResult } from '@/lib/forecast';

interface Props {
  result: ForecastResult;
}

export function ForecastSummaryCard({ result }: Props) {
  const {
    forecast,
    trend,
    trendPct,
    targetColumn,
    dateColumn,
    rowCount,
    dateGranularity,
  } = result;

  const trendColor =
    trend === 'up'
      ? 'var(--color-success)'
      : trend === 'down'
        ? 'var(--color-error)'
        : 'var(--color-text-muted)';

  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '~';

  const granularityLabel: Record<string, string> = {
    month: 'tháng',
    year: 'năm',
    day: 'ngày',
    unknown: 'kỳ',
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      {/* Header */}
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Dự báo →{' '}
        <span className="text-[var(--color-text)]">
          {targetColumn.toUpperCase()}
        </span>
      </p>

      {/* Subtitle */}
      <p className="text-[10px] text-[var(--color-text-faint)]">
        Dựa trên {rowCount.toLocaleString('vi-VN')} hàng dữ liệu · cột ngày:{' '}
        {dateColumn}
      </p>

      {/* Forecast rows */}
      <div className="mt-1 flex flex-col gap-0.5">
        {forecast.map((point) => {
          const ciWidth = Math.round((point.upper - point.lower) / 2);
          return (
            <div
              key={point.label}
              className="flex items-center gap-2 border-b border-[var(--color-border)] py-1 last:border-b-0"
            >
              {/* Label */}
              <span className="w-20 shrink-0 text-xs text-[var(--color-text-muted)]">
                {point.label}
              </span>
              {/* Value */}
              <span className="flex-1 text-xs font-semibold text-[var(--color-text)]">
                {Math.round(point.value).toLocaleString('vi-VN')}
              </span>
              {/* CI */}
              {ciWidth > 0 && (
                <span className="text-[10px] text-[var(--color-text-faint)]">
                  ±{ciWidth.toLocaleString('vi-VN')}
                </span>
              )}
              {/* Trend arrow */}
              <span
                className="text-xs font-bold"
                style={{ color: trendColor }}
              >
                {trendIcon}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
        Xu hướng{' '}
        <span style={{ color: trendColor }} className="font-semibold">
          {trend === 'up' ? 'TĂNG' : trend === 'down' ? 'GIẢM' : 'ỔN ĐỊNH'}{' '}
          {Math.abs(trendPct) >= 0.1
            ? `${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`
            : ''}
        </span>{' '}
        trong {forecast.length}{' '}
        {granularityLabel[dateGranularity] ?? 'kỳ'} tới · Độ tin cậy 95%
      </p>
    </div>
  );
}
