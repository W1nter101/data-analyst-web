'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import GridLayout from 'react-grid-layout';

import { DashboardWidget as DashboardWidgetItem } from '@/components/dashboard/DashboardWidget';
import { useAppStore } from '@/store/appStore';
import type { DashboardWidget } from '@/types';

type GridLayoutComponent = (props: {
  children: ReactNode;
  className?: string;
  layout: Array<GridPosition & { minW?: number; minH?: number }>;
  cols: number;
  rowHeight: number;
  onLayoutChange: (layout: unknown) => void;
  isDraggable?: boolean;
  isResizable?: boolean;
  margin?: [number, number];
  containerPadding?: [number, number];
  compactType?: 'vertical' | 'horizontal' | null;
  preventCollision?: boolean;
}) => React.JSX.Element;
type WidthProviderLike = {
  WidthProvider?: (component: typeof GridLayout) => unknown;
};

const widthProvider = (GridLayout as unknown as WidthProviderLike).WidthProvider;
const ReactGridLayout: GridLayoutComponent = widthProvider
  ? (widthProvider(GridLayout) as GridLayoutComponent)
  : (GridLayout as unknown as GridLayoutComponent);

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
        minH: 3,
      })),
    [dashboardWidgets, mobile],
  );

  const handleLayoutChange = (nextLayout: unknown) => {
    const normalized = (Array.isArray(nextLayout) ? nextLayout : []) as GridPosition[];
    updateDashboardLayout(mapWidgetsFromLayout(dashboardWidgets, normalized, cols));
  };

  if (dashboardWidgets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 bg-black/2 px-4 py-8 text-center text-sm text-foreground/70 dark:border-white/20 dark:bg-white/4">
        No charts yet. Use the chart builder above to add one.
      </div>
    );
  }

  return (
    <ReactGridLayout
      className="layout"
      layout={layout}
      cols={cols}
      rowHeight={60}
      onLayoutChange={handleLayoutChange}
      isDraggable
      isResizable
      margin={[16, 16]}
      containerPadding={[0, 0]}
      compactType="vertical"
      preventCollision={false}
    >
      {dashboardWidgets.map((widget) => (
        <DashboardWidgetItem key={widget.id} widget={widget} />
      ))}
    </ReactGridLayout>
  );
}
