'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy';
import type { Layout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { DashboardWidget as DashboardWidgetItem } from '@/components/dashboard/DashboardWidget';
import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

/**
 * WidthProvider HOC must be applied at module level (outside the component).
 * Applying inside render re-creates the component on every render and breaks drag state.
 */
const GridLayoutWithWidth = WidthProvider(ReactGridLayout);

type GridPosition = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function isMobileViewport(width: number): boolean {
  return width < 768;
}

function mapWidgetsFromLayout(
  widgets: DashboardWidget[],
  layout: GridPosition[],
  cols: number,
): DashboardWidget[] {
  return widgets.map((widget) => {
    const next = layout.find((l) => l.i === widget.id);
    if (!next) return widget;
    return {
      ...widget,
      layout: {
        x: Math.max(0, Math.min(next.x, cols - 1)),
        y: next.y,
        w: next.w,
        h: next.h,
      },
    };
  });
}

export function DashboardGrid() {
  const dashboardWidgets = useAppStore((s) => s.dashboardWidgets);
  const updateDashboardLayout = useAppStore((s) => s.updateDashboardLayout);

  const [viewportWidth, setViewportWidth] = useState(1024);

  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const mobile = isMobileViewport(viewportWidth);
  const cols = mobile ? 1 : 12;

  const layout = useMemo(
    () =>
      dashboardWidgets.map((widget) => ({
        i: widget.id,
        x: mobile ? 0 : widget.layout.x,
        y: widget.layout.y,
        w: mobile ? 1 : widget.layout.w,
        h: widget.layout.h,
        minW: 1,
        minH: widget.widgetType === 'empty' ? 3 : widget.widgetType === 'forecast' ? 6 : 4,
        // Empty widgets are non-draggable and non-resizable
        isDraggable: widget.widgetType !== 'empty',
        isResizable: widget.widgetType !== 'empty',
        static: false, // allow it to be pushed down
      })),
    [dashboardWidgets, mobile],
  );

  const handleLayoutChange = (nextLayout: Layout) => {
    const normalized = (Array.isArray(nextLayout) ? nextLayout : []) as GridPosition[];
    updateDashboardLayout(mapWidgetsFromLayout(dashboardWidgets, normalized, cols));
  };

  return (
    <GridLayoutWithWidth
      className="layout"
      layout={layout}
      cols={cols}
      rowHeight={60}
      onLayoutChange={handleLayoutChange}
      isDraggable={true}
      isResizable={true}
      draggableHandle=".chart-drag-handle"
      margin={[16, 16] as const}
      containerPadding={[0, 0] as const}
      compactType="vertical"
      preventCollision={false}
    >
      {dashboardWidgets.map((widget) => (
        <DashboardWidgetItem key={widget.id} widget={widget} />
      ))}
    </GridLayoutWithWidth>
  );
}
