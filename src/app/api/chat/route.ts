import { NextRequest, NextResponse } from 'next/server';

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const LM_STUDIO_MODEL =
  process.env.LM_STUDIO_MODEL || 'sql-phi3';

const SYSTEM_PROMPT = `You are a data analysis AI. Given schema and user_query, return valid JSON only.

Schema columns will be provided in the user message. Use EXACT column names from schema.

## Intent: "visualize"
When user asks for a chart/graph:
{
  "intent": "visualize",
  "chart_config": {
    "type": "Bar | Line | Pie | Scatter | Area",
    "x_axis": "<exact column name from schema>",
    "y_axis": "<exact column name from schema>",
    "title": "<short descriptive title>",
    "aggregation": { "function": "sum | avg | count | min | max", "group_by": "<column>" },
    "filters": [{ "column": "<col>", "operator": "eq | in | gt | lt", "value": "<val>" }],
    "color_by": "<column or null>"
  }
}

## Intent: "analyze"
When user asks a question requiring calculation (ranking, comparison, summary, trend):
{
  "intent": "analyze",
  "analysis_config": {
    "operation": "rank | compare | summary | trend",
    "metric": "<EXACT column name from schema>",
    "group_by": "<EXACT column name from schema>",
    "aggregation": "sum | avg | count | min | max",
    "limit": <number or null>,
    "filters": [{ "column": "<col>", "operator": "in | eq | gt | lt", "value": "<val>" }]
  }
}

Operation rules:
- rank: top/bottom N → set limit = N, no filters needed
- compare: specific groups → set filters with those group values
- summary: totals across all data → no filters, no limit
- trend: over time → group_by = date/time column

## Intent: "unknown"
When query is not about data:
{ "intent": "unknown", "message": "Tôi chỉ có thể giúp phân tích dữ liệu CSV." }

Return JSON only. No explanation, no markdown.`;

/**
 * Attempt to extract JSON from a string that may contain markdown
 * code fences or other wrapper text around the actual JSON.
 */
function extractJson(rawContent: string): unknown {
  if (!rawContent?.trim()) return null;

  // Attempt 1: direct parse
  try { return JSON.parse(rawContent.trim()); } catch { }

  // Attempt 2: prefill trick — model omitted opening "{"
  try { return JSON.parse("{" + rawContent); } catch { }

  // Attempt 3: model echoed system prompt after JSON — extract first balanced object
  const startIdx = rawContent.indexOf("{");
  const source = startIdx >= 0 ? rawContent.slice(startIdx) : "{" + rawContent;
  let depth = 0, inString = false, escape = false, endIdx = -1;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx !== -1) {
    try { return JSON.parse(source.slice(0, endIdx + 1)); } catch { }
  }
  return null;
}

/**
 * Send a request to LM Studio and parse the response as JSON.
 * Returns the parsed object or null if parsing fails.
 */
async function callLMStudio(
  schema: unknown,
  userQuery: string,
  columnList: string[],
): Promise<Record<string, unknown> | null> {
  const userContent = JSON.stringify({
    schema,
    user_query: userQuery,
    available_columns: columnList,
    instruction: `Use ONLY column names from available_columns for x_axis, y_axis, filters.column, aggregation.group_by, and color_by.`,
  });

  const res = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LM_STUDIO_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      stream: false,
      max_tokens: 200,
      stop: ["\n\n##", "## Intent", "### Query", "### Instr"],
    }),
  });

  if (!res.ok) {
    console.error(`LM Studio returned ${res.status}: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  const rawContent: string = data?.choices?.[0]?.message?.content ?? '';

  const parsed = extractJson(rawContent);
  if (!parsed) {
    console.error('Failed to extract JSON from LM Studio response:', rawContent);
    return null;
  }
  return parsed as Record<string, unknown>;
}

/**
 * Validate response shape. Accepts two valid intents:
 * - "visualize": must have chart_config with type, x_axis, y_axis
 * - "unknown":   must have message string
 * - "analyze":   must have analysis_config with required fields
 */
function isValidResponse(obj: Record<string, unknown>): boolean {
  if (typeof obj.intent !== 'string') return false;

  if (obj.intent === 'unknown') {
    return typeof obj.message === 'string';
  }

  if (obj.intent === 'visualize') {
    const cc = obj.chart_config;
    if (!cc || typeof cc !== 'object') return false;
    const config = cc as Record<string, unknown>;
    return (
      typeof config.type === 'string' &&
      typeof config.x_axis === 'string' &&
      typeof config.y_axis === 'string'
    );
  }

  if (obj.intent === 'analyze') {
    const ac = obj.analysis_config;
    if (!ac || typeof ac !== 'object') return false;
    const config = ac as Record<string, unknown>;
    return (
      typeof config.operation === 'string' &&
      typeof config.metric === 'string' &&
      typeof config.aggregation === 'string'
      // group_by is optional: model omits it when using filters for compare/rank
    );
  }

  return false;
}

function buildSqlFromChartConfig(cc: Record<string, unknown>, tableName = "data"): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggFn = (cc.aggregation as any)?.function?.toUpperCase() ?? "SUM";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupBy = (cc.aggregation as any)?.group_by ?? cc.x_axis;
  const yAxis = cc.y_axis as string;

  let sql = `SELECT "${groupBy}", ${aggFn}(CAST(REPLACE("${yAxis}", ',', '') AS REAL)) AS value\nFROM "${tableName}"`;

  const filters = cc.filters as Array<{ column: string; operator: string; value: unknown }> | undefined;
  if (filters && filters.length > 0) {
    const whereClauses = filters.map(f => {
      if (f.operator === 'in' && Array.isArray(f.value)) {
        const vals = f.value.map((v: unknown) => `'${v}'`).join(', ');
        return `"${f.column}" IN (${vals})`;
      }
      return `"${f.column}" = '${f.value}'`;
    });
    sql += `\nWHERE ${whereClauses.join(' AND ')}`;
  }

  sql += `\nGROUP BY "${groupBy}"\nORDER BY value DESC\nLIMIT 50`;
  return sql;
}

function buildSqlFromAnalysisConfig(ac: Record<string, unknown>, tableName = "data"): string {
  const aggFn = (ac.aggregation as string)?.toUpperCase() ?? "SUM";
  const metric = ac.metric as string;
  const groupBy = (ac.group_by as string)
    ?? (ac.filters as Array<{column: string}>)?.[0]?.column
    ?? (ac.metric as string);
  const limit = typeof ac.limit === 'number' ? ac.limit : null;

  let sql = `SELECT "${groupBy}", ${aggFn}(CAST(REPLACE("${metric}", ',', '') AS REAL)) AS value\nFROM "${tableName}"`;

  const filters = ac.filters as Array<{ column: string; operator: string; value: unknown }> | undefined;
  if (filters && filters.length > 0) {
    const whereClauses = filters.map(f => {
      if (f.operator === 'in' && Array.isArray(f.value)) {
        const vals = f.value.map((v: unknown) => `'${v}'`).join(', ');
        return `"${f.column}" IN (${vals})`;
      }
      return `"${f.column}" = '${f.value}'`;
    });
    sql += `\nWHERE ${whereClauses.join(' AND ')}`;
  }

  sql += `\nGROUP BY "${groupBy}"\nORDER BY value DESC`;
  if (limit) sql += `\nLIMIT ${limit}`;

  return sql;
}

/**
 * POST /api/chat
 *
 * Body:     { schema: SchemaItem[], user_query: string }
 * Response: { intent, chart_config } or { error }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schema, user_query } = body;

    if (!schema || !user_query) {
      return NextResponse.json(
        { error: 'schema và user_query là bắt buộc' },
        { status: 400 },
      );
    }

    // Extract column names from schema for the AI prompt
    const columnList: string[] = Array.isArray(schema)
      ? schema.map((s: { column_name?: string }) => s.column_name ?? '').filter(Boolean)
      : [];

    // Attempt 1
    let result = await callLMStudio(schema, user_query, columnList);

    // If parse failed, retry once
    if (!result) {
      console.log('Retry: first attempt returned null, retrying...');
      result = await callLMStudio(schema, user_query, columnList);
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Không thể phân tích phản hồi từ AI. Hãy thử lại.' },
        { status: 502 },
      );
    }

    if (!isValidResponse(result)) {
      return NextResponse.json(
        {
          error: 'AI trả về định dạng không hợp lệ. Hãy mô tả rõ hơn.',
          raw: result,
        },
        { status: 422 },
      );
    }

    // Unknown intent — pass through message to client
    if (result.intent === 'unknown') {
      return NextResponse.json({
        intent: 'unknown',
        message: result.message || 'Tôi chỉ có thể giúp phân tích dữ liệu CSV.',
      });
    }

    // Handle visualze or analyze intent
    if (result.intent === 'visualize' || result.intent === 'analyze') {
      const { generateAndRunSql, executeSql } = await import('@/lib/sqlAgent');
      
      let sqlData: { sql: string; rows: Record<string, unknown>[]; error?: string } | null = null;
      
      if (result.intent === 'visualize' && result.chart_config) {
        try {
          const builtSql = buildSqlFromChartConfig(result.chart_config as Record<string, unknown>);
          sqlData = executeSql(builtSql);
          if (sqlData.error || sqlData.rows.length === 0) {
            sqlData = null; // fallback
          }
        } catch (err) {
          console.error("Failed to build/execute visualize SQL manually:", err);
        }
      } else if (result.intent === 'analyze' && result.analysis_config) {
        try {
          const builtSql = buildSqlFromAnalysisConfig(result.analysis_config as Record<string, unknown>);
          sqlData = executeSql(builtSql);
          if (sqlData.error || sqlData.rows.length === 0) {
            sqlData = null; // fallback
          }
        } catch (err) {
          console.error("Failed to build/execute analyze SQL manually:", err);
        }
      }

      if (!sqlData) {
        sqlData = await generateAndRunSql(user_query);
      }

      const { sql, rows, error } = sqlData;

      if (error) {
        return NextResponse.json({
          intent: 'analyze', // Use analyze intent to show the error message bubble
          message: 'Không thể phân tích câu hỏi này',
        });
      }

      if (rows.length === 0) {
        return NextResponse.json({
          intent: 'analyze',
          message: 'Không tìm thấy dữ liệu phù hợp',
        });
      }

      if (result.intent === 'visualize') {
        return NextResponse.json({
          intent: 'visualize',
          chart_config: result.chart_config,
          sql_data: rows,
        });
      } else {
        // analyze
        const columns = Object.keys(rows[0]);
        const tableHeader = `| ${columns.join(' | ')} |`;
        const tableDivider = `| ${columns.map(() => '---').join(' | ')} |`;
        const tableRows = rows
          .map((r) => `| ${columns.map((c) => String(r[c] ?? '')).join(' | ')} |`)
          .join('\n');
        const markdownTable = `${tableHeader}\n${tableDivider}\n${tableRows}`;

        return NextResponse.json({
          intent: 'analyze',
          markdownTable,
        });
      }
    }

    return NextResponse.json({ error: 'Lỗi không xác định' }, { status: 500 });
  } catch (error) {
    console.error('Chat API error:', error);

    const isConnectionError =
      error instanceof TypeError &&
      error.message.includes('fetch failed');

    if (isConnectionError) {
      return NextResponse.json(
        { error: 'Không thể kết nối đến LM Studio. Hãy kiểm tra server.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: 'Lỗi hệ thống khi xử lý yêu cầu AI' },
      { status: 500 },
    );
  }
}