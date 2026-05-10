import { v4 as uuidv4 } from 'uuid';

import type { AppStoreState } from '@/store/appStore';
import type { ChartType } from '@/types';

/**
 * Shape of the AI model's chart_config output.
 */
export interface AIChartConfig {
  type: string;   // "Line", "Bar", "Pie", "Scatter", "Area"
  x_axis: string; // column name for X axis
  y_axis: string; // column name for Y axis
}

/**
 * Map model output chart type (capitalized) to app ChartType (lowercase).
 */
const CHART_TYPE_MAP: Record<string, ChartType> = {
  line: 'line',
  bar: 'bar',
  pie: 'pie',
  scatter: 'scatter',
  area: 'area',
};

function normalizeChartType(modelType: string): ChartType {
  return CHART_TYPE_MAP[modelType.toLowerCase()] ?? 'bar';
}

// ── Fix 3: Keyword-based chart type override ──────────────────────

/**
 * Keyword rules that override the model's chart type based on the
 * user's Vietnamese natural language query. This is a safety net:
 * if the model picks a wrong type but the user clearly says
 * "so sánh" (compare), we force bar chart, etc.
 */
const KEYWORD_OVERRIDES: Array<{ keywords: string[]; type: ChartType }> = [
  { keywords: ['so sánh', 'so với', 'giữa các'], type: 'bar' },
  { keywords: ['xu hướng', 'theo thời gian', 'qua các'], type: 'line' },
  { keywords: ['tỷ lệ', 'phân bổ', 'cơ cấu'], type: 'pie' },
  { keywords: ['phân tán', 'tương quan'], type: 'scatter' },
  { keywords: ['diện tích', 'area'], type: 'area' },
];

/**
 * Check if the user query contains keywords that should force a
 * specific chart type, overriding the model's choice.
 */
function getKeywordOverride(userQuery: string): ChartType | null {
  const lower = userQuery.toLowerCase();
  for (const rule of KEYWORD_OVERRIDES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return rule.type;
      }
    }
  }
  return null;
}

// ── Result type ───────────────────────────────────────────────────

export interface ApplyResult {
  success: boolean;
  message: string;
  chartType?: ChartType;
}

/**
 * Validate and apply an AI-generated chart config to the app store.
 *
 * 1. Applies keyword override on chart type (safety net over model output)
 * 2. Validates that x_axis and y_axis columns exist in the current CSV
 * 3. Maps model types ("Line") to app types ("line")
 * 4. Calls appStore.addChart() + appStore.updateDashboardLayout()
 * 5. Returns a success/error result for the chat UI to display
 *
 * Does NOT modify appStore.ts — uses the existing public API.
 */
export function applyChartConfig(
  aiConfig: AIChartConfig,
  store: AppStoreState,
  userQuery?: string,
): ApplyResult {
  const csv = store.csv;

  if (!csv) {
    return {
      success: false,
      message: 'Chưa có dữ liệu CSV. Hãy tải lên file trước.',
    };
  }

  // Validate columns exist
  const headers = csv.headers;

  if (!headers.includes(aiConfig.x_axis)) {
    return {
      success: false,
      message: `Cột '${aiConfig.x_axis}' không tồn tại trong dữ liệu. Các cột hiện có: ${headers.join(', ')}`,
    };
  }

  if (!headers.includes(aiConfig.y_axis)) {
    return {
      success: false,
      message: `Cột '${aiConfig.y_axis}' không tồn tại trong dữ liệu. Các cột hiện có: ${headers.join(', ')}`,
    };
  }

  // Map type from model output
  let chartType = normalizeChartType(aiConfig.type);

  // Fix 3: Apply keyword override if user query contains specific terms
  if (userQuery) {
    const override = getKeywordOverride(userQuery);
    if (override && override !== chartType) {
      console.log(
        `[chartConfigHandler] Keyword override: "${aiConfig.type}" → "${override}" (query: "${userQuery}")`,
      );
      chartType = override;
    }
  }

  const chartId = uuidv4();
  const title = `${aiConfig.y_axis} theo ${aiConfig.x_axis}`;

  // Add chart via existing appStore API
  store.addChart({
    id: chartId,
    type: chartType,
    title,
    xColumn: aiConfig.x_axis,
    yColumn: aiConfig.y_axis,
  });

  // Add dashboard widget below all existing ones
  const currentWidgets = store.dashboardWidgets;
  const bottomY = currentWidgets.reduce(
    (max, w) => Math.max(max, w.layout.y + w.layout.h),
    0,
  );

  store.updateDashboardLayout([
    ...currentWidgets,
    {
      id: uuidv4(),
      chartId,
      layout: { x: 0, y: bottomY, w: 6, h: 6 },
    },
  ]);

  return {
    success: true,
    message: `Đã tạo biểu đồ ${chartType} "${title}" cho bạn`,
    chartType,
  };
}
