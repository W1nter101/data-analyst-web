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
      <div className="flex min-h-[400px] w-full items-center justify-center rounded-xl border border-dashed border-foreground/15 bg-foreground/2">
        <p className="text-sm text-foreground/40">
          Kéo trường vào X Axis và Values để xem trước biểu đồ
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] w-full">
      <ChartRenderer chartConfig={chartConfig} data={data} />
    </div>
  );
}
