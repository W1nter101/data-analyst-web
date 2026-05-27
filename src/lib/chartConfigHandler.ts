import { v4 as uuidv4 } from 'uuid';

import type { AppStoreState } from '@/store/appStore';
import type { ChartType } from '@/types';
import { applyAIChartConfig, type AIChartIntent } from '@/lib/applyAIChartConfig';

/**
 * Shape of the AI model's chart_config output.
 * Extended to support filters, aggregation, color_by, and title.
 */
export interface AIChartConfig {
  type: string;   // "Line", "Bar", "Pie", "Scatter", "Area"
  x_axis: string; // column name for X axis
  y_axis: string; // column name for Y axis
  title?: string;
  filters?: Array<{
    column: string;
    operator: 'eq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains';
    value: string | string[] | number;
  }>;
  aggregation?: {
    function: 'sum' | 'avg' | 'count' | 'min' | 'max';
    group_by?: string;
  };
  color_by?: string;
  sort?: 'asc' | 'desc' | 'none';
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

function getSortOverride(userQuery: string): 'asc' | 'desc' | 'none' {
  const lower = userQuery.toLowerCase();
  const descKeywords = ['cao xuống', 'lớn nhất trước', 'giảm dần', 'descending', 'từ trên xuống'];
  const ascKeywords = ['thấp lên', 'nhỏ nhất trước', 'tăng dần', 'ascending', 'từ dưới lên'];
  if (descKeywords.some(k => lower.includes(k))) return 'desc';
  if (ascKeywords.some(k => lower.includes(k))) return 'asc';
  return 'none';
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
 * Pipeline:
 * 1. Validate x_axis / y_axis columns exist in CSV
 * 2. Apply keyword override on chart type (safety net over model output)
 * 3. Run applyAIChartConfig() to filter/aggregate raw data (validation)
 * 4. Create ChartConfig and DashboardWidget via appStore API
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

  // Run the AI chart config pipeline to validate filters work
  const aiIntent: AIChartIntent = {
    intent: 'visualize',
    chart_type: chartType,
    x_axis: aiConfig.x_axis,
    y_axis: aiConfig.y_axis,
    filters: aiConfig.filters,
    aggregation: aiConfig.aggregation,
    color_by: aiConfig.color_by,
    title: aiConfig.title,
  };
  const processed = applyAIChartConfig(csv.rows, aiIntent);

  if (processed.labels.length === 0) {
    return {
      success: false,
      message: 'Sau khi lọc dữ liệu, không còn dòng nào phù hợp. Hãy thử lại với điều kiện khác.',
    };
  }

  const chartId = uuidv4();
  const title = aiConfig.title ?? `${aiConfig.y_axis} theo ${aiConfig.x_axis}`;
  const sortOrder = getSortOverride(userQuery ?? '') || aiConfig.sort || 'none';

  // Add chart via existing appStore API
  store.addChart({
    id: chartId,
    type: chartType,
    title,
    xColumn: aiConfig.x_axis,
    yColumn: aiConfig.y_axis,
    colorColumn: aiConfig.color_by,
    filters: aiConfig.filters,
    sortOrder,
  });

  // Add dashboard widget below all existing ones
  store.addWidget({
    id: uuidv4(),
    widgetType: 'chart',
    chartId,
    layout: { x: 0, y: Infinity, w: 6, h: 6 },
  });

  return {
    success: true,
    message: `Đã tạo biểu đồ ${chartType} "${title}" cho bạn`,
    chartType,
  };
}
