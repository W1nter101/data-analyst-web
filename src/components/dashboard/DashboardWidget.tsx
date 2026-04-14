'use client';

import { ChartWidget } from '@/components/chart/ChartWidget';
import type { DashboardWidget as DashboardWidgetType } from '@/types';

type DashboardWidgetProps = {
  widget: DashboardWidgetType;
};

export function DashboardWidget({ widget }: DashboardWidgetProps) {
  return (
    <div
      data-grid={{
        i: widget.id,
        x: widget.layout.x,
        y: widget.layout.y,
        w: widget.layout.w,
        h: widget.layout.h,
      }}
      className="h-full"
    >
      <ChartWidget widget={widget} />
    </div>
  );
}
