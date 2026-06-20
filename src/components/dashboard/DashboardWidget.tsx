'use client';

import React from 'react';

import { ChartWidget } from '@/components/chart/ChartWidget';
import { EmptySlotWidget } from '@/components/widgets/EmptySlotWidget';
import { ImageWidget } from '@/components/widgets/ImageWidget';
import { TableWidget } from '@/components/widgets/TableWidget';
import { TextWidget } from '@/components/widgets/TextWidget';
import { ForecastChart } from '@/components/chart/ForecastChart';
import type { DashboardWidget as DashboardWidgetType } from '@/types';

type DashboardWidgetProps = {
  widget: DashboardWidgetType;
} & React.HTMLAttributes<HTMLDivElement>;

/**
 * react-grid-layout clones each direct child and injects style, className,
 * onMouseDown, onTouchStart, and other props. This component MUST forward
 * all extra props to the outer DOM element, otherwise drag/resize breaks.
 */
export const DashboardWidget = React.forwardRef<HTMLDivElement, DashboardWidgetProps>(
  function DashboardWidget({ widget, style, className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        style={style}
        className={`${className ?? ''} h-full overflow-hidden`}
        data-widget-id={widget.id}
        {...rest}
      >
        {widget.widgetType === 'chart' && <ChartWidget widget={widget} />}
        {widget.widgetType === 'text' && <TextWidget widget={widget} />}
        {widget.widgetType === 'image' && <ImageWidget widget={widget} />}
        {widget.widgetType === 'table' && <TableWidget widget={widget} />}
        {widget.widgetType === 'forecast' && widget.forecastResult && (
          <div className="h-full w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <ForecastChart result={widget.forecastResult} widgetId={widget.id} />
          </div>
        )}
        {(!widget.widgetType || widget.widgetType === 'empty') && (
          <EmptySlotWidget widgetId={widget.id} />
        )}
        {children}
      </div>
    );
  },
);

