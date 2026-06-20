'use client';

import { ChartRenderer } from '@/components/chart/ChartRenderer';
import type { ChartConfig, ParsedCSV } from '@/types';

type Props = {
  chartConfig: ChartConfig | null;
  data: ParsedCSV;
};

export function ComposerPreview({ chartConfig, data }: Props) {
  if (!chartConfig) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
        <p className="text-sm text-[var(--color-text-faint)]">
          Kéo trường vào X Axis và Values để xem trước biểu đồ
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <ChartRenderer chartConfig={chartConfig} data={data} />
    </div>
  );
}
