# Feature Plan: Phase 2 — Chart Builder & Dashboard Grid

## Goal
Let users create charts from their uploaded CSV data and arrange them in a drag-and-drop dashboard.

## User Story
> As a data analyst, I can pick two columns and a chart type to create a visualization. I can add multiple charts to a dashboard canvas, resize and rearrange them freely.

## Acceptance Criteria
- [ ] ChartPicker UI: select chart type (bar, line, pie, scatter, area) + X column + Y column
- [ ] Chart renders immediately using Recharts based on CSV data
- [ ] User can add multiple charts to the dashboard
- [ ] Dashboard uses react-grid-layout: drag, resize, delete widgets
- [ ] Each chart widget has a title (editable) and a delete button
- [ ] Responsive: single-column stack on mobile
- [ ] Empty state: "Add your first chart" prompt when dashboard is empty
- [ ] Charts re-render correctly when CSV data changes

## Files to Create
```
src/components/chart/ChartRenderer.tsx      # Core: renders any ChartConfig using Recharts
src/components/chart/ChartPicker.tsx        # Form: chart type + column selectors
src/components/chart/ChartWidget.tsx        # Dashboard widget wrapper (title, delete, resize handle)
src/components/dashboard/DashboardGrid.tsx  # react-grid-layout canvas
src/components/dashboard/DashboardWidget.tsx # Widget slot within grid
src/hooks/useCharts.ts                       # Chart list state
src/hooks/useDashboard.ts                    # Dashboard layout state
```

## Files to Modify
```
src/store/appStore.ts      # Add charts[], dashboardWidgets[]
src/types/index.ts         # ChartConfig, ChartType, DashboardWidget types
src/app/dashboard/page.tsx # Add ChartPicker + DashboardGrid panels
```

## Data Flow
```
User opens ChartPicker
  → Selects chart type + X column + Y column from schema
  → Creates ChartConfig object (with uuid id)
  → Saved to appStore.charts[]
  → DashboardGrid adds a DashboardWidget referencing chartId
  → ChartWidget renders ChartRenderer with the ChartConfig
  → ChartRenderer reads data from appStore.csv.rows, maps to Recharts format
```

## ChartRenderer Contract
ChartRenderer must accept only a `ChartConfig` and `ParsedCSV` as props.
It must handle:
- Missing xColumn or yColumn gracefully (show error state inside widget)
- Empty data (show empty state inside widget)
- Number formatting on axis labels (toLocaleString)

## Chart Type → Recharts Component Mapping
```
bar     → BarChart + Bar
line    → LineChart + Line
area    → AreaChart + Area
pie     → PieChart + Pie + Cell
scatter → ScatterChart + Scatter
```

## Dependencies to Add
```bash
npm install recharts
npm install react-grid-layout @types/react-grid-layout
npm install uuid @types/uuid
```

## Edge Cases
- Column selected for Y axis is not numeric → show warning, disable add button
- Only 1 row of data → charts still render but look minimal (acceptable)
- 50+ unique values on X axis → bar chart becomes unreadable; suggest limiting or grouping
- Deleting a widget must remove from both charts[] and dashboardWidgets[]

## Manual Test Checklist
- [ ] Create a bar chart with month/revenue columns → renders correctly
- [ ] Create a line chart, add to dashboard
- [ ] Drag widget to new position → layout persists
- [ ] Resize widget → chart re-renders at new size
- [ ] Delete widget → removed from grid
- [ ] Add 5 widgets → all visible with correct data
- [ ] Try selecting a string column as Y axis → disabled/warned
- [ ] Reload page (layout should reset — persistence is Phase 4)

