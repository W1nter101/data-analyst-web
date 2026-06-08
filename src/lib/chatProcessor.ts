/**
 * chatProcessor.ts — Core AI chat processing logic.
 *
 * Extracted from /api/chat/route.ts so it can be called from:
 *  - BullMQ Worker (async job queue)
 *  - Directly from route.ts (fallback / sync mode)
 *
 * This module is framework-agnostic (no Next.js imports).
 */

import appDb from '@/lib/appDb';
import { randomUUID } from 'crypto';
import { generateNarrative } from '@/lib/narrativeHelper';

// ── Config ────────────────────────────────────────────────────────────

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const LM_STUDIO_MODEL =
  process.env.LM_STUDIO_MODEL || 'sql-phi3';

const SYSTEM_PROMPT = `You are a data analysis AI. Given schema and user_query, return valid JSON only.

Schema columns will be provided in the user message. Use EXACT column names from schema.

## Intent: "transform"
When user wants to add/rename/delete a column or fill empty values:
{
  "intent": "transform",
  "transform_config": {
    "operation": "add_column | rename_column | delete_column | fill_empty",
    "column_name": "<target column name (new or existing)>",
    "expression": "<SQL expression for add_column, or fill value for fill_empty>",
    "new_name": "<only for rename_column>",
    "data_type": "REAL | TEXT | INTEGER",
    "description": "<Vietnamese human-readable explanation for user>"
  }
}

Operation rules:
- "thêm cột" / "tính thêm" / "add column" → operation: "add_column"
- "đổi tên" / "rename" → operation: "rename_column"
- "xóa cột" / "delete column" / "bỏ cột" → operation: "delete_column"
- "điền" / "fill" / "thay thế null" → operation: "fill_empty"

IMPORTANT: Use EXACT column names from available_columns in expression field.

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
    "color_by": "<column or null>",
    "sort": "asc | desc | none"
  }
}

Sort field rules:
- "xếp từ cao xuống thấp" / "lớn nhất trước" / "giảm dần" / "descending" → sort: "desc"
- "xếp từ thấp lên cao" / "nhỏ nhất trước" / "tăng dần" / "ascending" → sort: "asc"
- No sort mentioned → sort: "none"

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

## Intent: "key_influencers"
When user wants to know which columns/factors INFLUENCE or CORRELATE WITH a specific column.
This is about statistical correlation (Pearson/Spearman), NOT about aggregation or GROUP BY.

DISTINGUISH FROM "analyze":
- "analyze" → aggregation, GROUP BY, TOP N values, SUM/AVG/COUNT
- "key_influencers" → correlation between columns, what drives/affects a metric

Trigger keywords (Vietnamese + English):
  "yếu tố nào ảnh hưởng", "cột nào tác động", "nguyên nhân của",
  "ảnh hưởng đến", "tác động đến", "quan trọng nhất đến",
  "yếu tố nào quyết định", "cái gì ảnh hưởng", "điều gì tác động",
  "key influencers", "key factors", "what drives", "what affects",
  "what influences", "what impacts", "correlation with",
  "factors affecting", "drivers of"

Output JSON:
{
  "intent": "key_influencers",
  "targetColumn": "<exact column name from available_columns>"
}

Examples:
- "yếu tố nào ảnh hưởng đến Profit?" → { "intent": "key_influencers", "targetColumn": "Profit" }
- "cột nào tác động đến Units Sold?" → { "intent": "key_influencers", "targetColumn": "Units Sold" }
- "what drives Revenue?" → { "intent": "key_influencers", "targetColumn": "Revenue" }
- "doanh thu trung bình theo quốc gia?" → { "intent": "analyze" } ← aggregation, NOT correlation
- "top 5 sản phẩm bán chạy nhất?" → { "intent": "analyze" } ← ranking, NOT correlation
IMPORTANT: targetColumn must be an exact column name from the available_columns.
IMPORTANT: When user asks "yếu tố nào ảnh hưởng đến X", ALWAYS use key_influencers, NEVER analyze.

## Intent: "unknown"
When query is not about data:
{ "intent": "unknown", "message": "Tôi chỉ có thể giúp phân tích dữ liệu CSV." }

Return JSON only. No explanation, no markdown.`;

// ── Helpers ───────────────────────────────────────────────────────────

function extractJson(rawContent: string): unknown {
  if (!rawContent?.trim()) return null;

  try { return JSON.parse(rawContent.trim()); } catch { }
  try { return JSON.parse("{" + rawContent); } catch { }

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

async function callLMStudio(
  schema: unknown,
  userQuery: string,
  columnList: string[],
): Promise<Record<string, unknown> | null> {
  const userContent = JSON.stringify({
    schema,
    user_query: userQuery,
    available_columns: columnList,
    instruction: `Use ONLY column names from available_columns for x_axis, y_axis, filters.column, aggregation.group_by, color_by, and targetColumn.`,
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
  console.log("LM STUDIO RAW RESPONSE:", rawContent);
 
  const parsed = extractJson(rawContent);
  console.log("LM STUDIO PARSED RESPONSE:", parsed);
  if (!parsed) {
    console.error('Failed to extract JSON from LM Studio response:', rawContent);
    return null;
  }
  return parsed as Record<string, unknown>;
}

function isValidResponse(obj: Record<string, unknown>): boolean {
  console.log("isValidResponse checking object:", JSON.stringify(obj, null, 2));
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
      typeof config.metric === 'string'
    );
  }

  if (obj.intent === 'transform') {
    const tc = obj.transform_config;
    if (!tc || typeof tc !== 'object') return false;
    const config = tc as Record<string, unknown>;
    return (
      typeof config.operation === 'string' &&
      typeof config.column_name === 'string'
    );
  }

  // Key Influencers — structure-only check;
  // column existence is validated in the API route via PRAGMA table_info
  if (obj.intent === 'key_influencers') {
    return typeof obj.targetColumn === 'string' && obj.targetColumn.length > 0;
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
  const operation = (ac.operation as string) ?? '';
  const limit = typeof ac.limit === 'number' ? ac.limit : null;

  const explicitGroupBy = (ac.group_by as string)
    ?? (ac.filters as Array<{column: string}>)?.[0]?.column
    ?? null;

  const isSummary = operation === 'summary' && !explicitGroupBy;

  const filters = ac.filters as Array<{ column: string; operator: string; value: unknown }> | undefined;

  let sql: string;

  if (isSummary) {
    sql = `SELECT ${aggFn}(CAST(REPLACE("${metric}", ',', '') AS REAL)) AS value\nFROM "${tableName}"`;
  } else {
    const groupBy = explicitGroupBy ?? metric;
    sql = `SELECT "${groupBy}", ${aggFn}(CAST(REPLACE("${metric}", ',', '') AS REAL)) AS value\nFROM "${tableName}"`;
  }

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

  if (!isSummary) {
    const groupBy = explicitGroupBy ?? metric;
    sql += `\nGROUP BY "${groupBy}"\nORDER BY value DESC`;
    if (limit) sql += `\nLIMIT ${limit}`;
  }

  return sql;
}

// ── DB helpers ────────────────────────────────────────────────────────

function saveUserMessage(conversationId: string, content: string) {
  appDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, intent, sql_query, chart_config, created_at)
    VALUES (?, ?, 'user', ?, null, null, null, ?)
  `).run(randomUUID(), conversationId, content, Math.floor(Date.now() / 1000));
}

function saveAssistantMessage(
  conversationId: string,
  content: string,
  intent: string,
  sqlQuery?: string | null,
  chartConfig?: string | null,
) {
  appDb.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, intent, sql_query, chart_config, created_at)
    VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    conversationId,
    content,
    intent,
    sqlQuery || null,
    chartConfig || null,
    Math.floor(Date.now() / 1000),
  );
  appDb.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), conversationId);
}

// ── Main processor ────────────────────────────────────────────────────

export interface ChatJobInput {
  schema: unknown;
  user_query: string;
  fileId: string;
  conversationId: string | null;
  dbPath: string;
  columnList: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatJobResult = Record<string, any>;

/**
 * Process a chat request end-to-end.
 *
 * This is the core pipeline: LM Studio → SQL → narrative → result.
 * Framework-agnostic — returns a plain object, no NextResponse.
 */
export async function processChat(input: ChatJobInput): Promise<ChatJobResult> {
  const { schema, user_query, conversationId, dbPath, columnList } = input;

  // ─── KEY INFLUENCERS REGEX BYPASS ──────────────────────────────────
  // phi-3-mini can't reliably classify this intent via SYSTEM_PROMPT.
  // Regex detect at server level — no LLM call needed.
  const KEY_INFLUENCER_REGEX =
    /yếu tố nào|yếu tố.*ảnh hưởng|cột nào.*ảnh hưởng|cột nào.*tác động|ảnh hưởng (?:nhiều nhất |chính |lớn nhất )?đến|tác động (?:nhiều nhất |chính |lớn nhất )?đến|quan trọng nhất.*đến|nguyên nhân.*của|what drives|what affects|what influences|what impacts|key factor|key influencer/i;

  if (KEY_INFLUENCER_REGEX.test(user_query)) {
    // Extract targetColumn from query: "đến <column>" or "to/of <column>"
    const colPatterns = [
      /(?:đến|to)\s+["\u2018\u2019\u201c\u201d]?([^?.,\n"]+?)["\u2018\u2019\u201c\u201d]?\s*(?:\?|$)/i,
      /(?:của|of)\s+["\u2018\u2019\u201c\u201d]?([^?.,\n"]+?)["\u2018\u2019\u201c\u201d]?\s*(?:\?|$)/i,
    ];

    let targetColumn: string | null = null;

    for (const pattern of colPatterns) {
      const match = user_query.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].trim();
        // Exact match (case-insensitive) against columnList
        const found = columnList.find(
          c => c.toLowerCase() === candidate.toLowerCase(),
        );
        if (found) {
          targetColumn = found;
          break;
        }
        // Partial match: "units sold" matches "Units Sold"
        const partial = columnList.find(c =>
          c.toLowerCase().includes(candidate.toLowerCase()) ||
          candidate.toLowerCase().includes(c.toLowerCase()),
        );
        if (partial) {
          targetColumn = partial;
          break;
        }
      }
    }

    // Fallback: find any numeric column mentioned in the query
    if (!targetColumn) {
      const schemaArr = schema as Array<{ column_name: string; data_type: string }>;
      if (Array.isArray(schemaArr)) {
        const numericCols = schemaArr.filter(c =>
          c.data_type === 'number' || c.data_type === 'REAL' || c.data_type === 'INTEGER',
        );
        for (const col of numericCols) {
          if (user_query.toLowerCase().includes(col.column_name.toLowerCase())) {
            targetColumn = col.column_name;
            break;
          }
        }
      }
    }

    if (targetColumn) {
      console.log(`[KEY_INFLUENCERS REGEX] Bypassed LLM → targetColumn: "${targetColumn}"`);
      if (conversationId) {
        saveUserMessage(conversationId, user_query);
        saveAssistantMessage(
          conversationId,
          `Key Influencers: ${targetColumn}`,
          'key_influencers',
        );
      }
      return {
        intent: 'key_influencers' as const,
        targetColumn,
      };
    }
    // If regex matched but no column found → fall through to normal LLM flow
  }
  // ───────────────────────────────────────────────────────────────────

  // ── Call LM Studio (with 1 retry) ───────────────────────────────
  let result = await callLMStudio(schema, user_query, columnList);
  if (!result) {
    console.log('Retry: first attempt returned null, retrying...');
    result = await callLMStudio(schema, user_query, columnList);
  }

  if (!result) {
    throw new Error('Không thể phân tích phản hồi từ AI. Hãy thử lại.');
  }

  if (!isValidResponse(result)) {
    throw new Error('AI trả về định dạng không hợp lệ. Hãy mô tả rõ hơn.');
  }

  // ── Unknown intent ──────────────────────────────────────────────
  if (result.intent === 'unknown') {
    const message = (result.message as string) || 'Tôi chỉ có thể giúp phân tích dữ liệu CSV.';
    if (conversationId) {
      saveUserMessage(conversationId, user_query);
      saveAssistantMessage(conversationId, message, 'unknown');
    }
    return { intent: 'unknown', message };
  }

  // ── Key Influencers intent ──────────────────────────────────────
  if (result.intent === 'key_influencers') {
    // Persist to conversation history — consistent with other intents
    if (conversationId) {
      saveUserMessage(conversationId, user_query);
      saveAssistantMessage(
        conversationId,
        `Key Influencers: ${result.targetColumn}`,
        'key_influencers',
      );
    }
    return {
      intent: 'key_influencers',
      targetColumn: result.targetColumn,
    };
  }

  // ── Transform intent ────────────────────────────────────────────
  if (result.intent === 'transform') {
    const tc = result.transform_config as Record<string, any>;
    if (tc && !tc.description) {
      const op = tc.operation;
      const col = tc.column_name;
      const expr = tc.expression;
      const newName = tc.new_name;
      if (op === 'add_column') {
        tc.description = `Sẽ thêm cột "${col}"` + (expr ? ` = ${expr}` : '');
      } else if (op === 'rename_column') {
        tc.description = `Sẽ đổi tên cột "${col}" thành "${newName || ''}"`;
      } else if (op === 'delete_column') {
        tc.description = `Sẽ xóa cột "${col}"`;
      } else if (op === 'fill_empty') {
        tc.description = `Sẽ điền ô trống trong cột "${col}" bằng "${expr || '0'}"`;
      } else {
        tc.description = `Sẽ thực hiện thao tác "${op}" cho cột "${col}"`;
      }
    }
    return {
      intent: 'transform',
      transform_config: result.transform_config,
    };
  }

  // ── Visualize or Analyze ────────────────────────────────────────
  if (result.intent === 'visualize' || result.intent === 'analyze') {
    const { generateAndRunSql, executeSql } = await import('@/lib/sqlAgent');

    let sqlData: { sql: string; rows: Record<string, unknown>[]; error?: string } | null = null;

    if (result.intent === 'visualize' && result.chart_config) {
      try {
        const builtSql = buildSqlFromChartConfig(result.chart_config as Record<string, unknown>);
        sqlData = executeSql(dbPath, builtSql);
        if (sqlData.error || sqlData.rows.length === 0) sqlData = null;
      } catch (err) {
        console.error("Failed to build/execute visualize SQL:", err);
      }
    } else if (result.intent === 'analyze' && result.analysis_config) {
      try {
        const builtSql = buildSqlFromAnalysisConfig(result.analysis_config as Record<string, unknown>);
        sqlData = executeSql(dbPath, builtSql);
        if (sqlData.error || sqlData.rows.length === 0) sqlData = null;
      } catch (err) {
        console.error("Failed to build/execute analyze SQL:", err);
      }
    }

    if (!sqlData) {
      sqlData = await generateAndRunSql(dbPath, user_query);
    }

    const { sql, rows, error } = sqlData;

    // ── Error / empty ─────────────────────────────────────────────
    if (error) {
      if (conversationId) {
        saveUserMessage(conversationId, user_query);
        saveAssistantMessage(conversationId, 'Không thể phân tích câu hỏi này', 'analyze');
      }
      return { intent: 'analyze', message: 'Không thể phân tích câu hỏi này' };
    }

    if (rows.length === 0) {
      if (conversationId) {
        saveUserMessage(conversationId, user_query);
        saveAssistantMessage(conversationId, 'Không tìm thấy dữ liệu phù hợp', 'analyze', sql);
      }
      return { intent: 'analyze', message: 'Không tìm thấy dữ liệu phù hợp' };
    }

    // ── Visualize result ──────────────────────────────────────────
    if (result.intent === 'visualize') {
      const cc = result.chart_config as Record<string, unknown>;
      const chartType = (cc.type as string || 'bar').toLowerCase();
      const title = cc.title as string || `${cc.y_axis} theo ${cc.x_axis}`;
      const content = `Đã vẽ biểu đồ ${chartType} "${title}" cho bạn`;

      let narrative: string | null = null;
      if (rows.length > 0) {
        narrative = await generateNarrative(
          title,
          chartType,
          cc.x_axis as string,
          cc.y_axis as string,
          rows
        );
      }

      if (conversationId) {
        saveUserMessage(conversationId, user_query);
        saveAssistantMessage(
          conversationId,
          content,
          result.intent as string,
          sql,
          result.chart_config ? JSON.stringify(result.chart_config) : null,
        );
      }
      return {
        intent: 'visualize',
        chart_config: result.chart_config,
        sql_data: rows,
        narrative,
      };
    }

    // ── Analyze result ────────────────────────────────────────────
    const columns = Object.keys(rows[0]);

    // Detect aggregate single-value result
    const AGG_LABELS: Record<string, string> = {
      SUM: 'Tổng',
      COUNT: 'Số lượng',
      AVG: 'Trung bình',
      MIN: 'Giá trị nhỏ nhất',
      MAX: 'Giá trị lớn nhất',
    };
    const AGG_PATTERN = /^(SUM|COUNT|AVG|MIN|MAX)\((.+)\)$/i;

    const isSingleAggregate =
      rows.length === 1 &&
      columns.length <= 2 &&
      columns.some((c) => AGG_PATTERN.test(c) || c === 'value');

    let markdownTable: string;

    if (isSingleAggregate) {
      const parts: string[] = [];
      for (const col of columns) {
        const rawValue = rows[0][col];
        const match = col.match(AGG_PATTERN);
        let label: string;
        let displayValue: string;

        if (match) {
          const aggFnName = match[1].toUpperCase();
          const innerCol = match[2].replace(/"/g, '').trim();
          label = `${AGG_LABELS[aggFnName] ?? aggFnName} ${innerCol}`;
        } else if (col === 'value') {
          label = 'Kết quả';
        } else {
          label = col;
        }

        const num = Number(rawValue);
        if (!isNaN(num)) {
          displayValue = num.toLocaleString('vi-VN');
        } else {
          displayValue = String(rawValue ?? '');
        }

        parts.push(`### ${label}\n# **${displayValue}**`);
      }
      markdownTable = parts.join('\n\n');
    } else {
      const tableHeader = `| ${columns.join(' | ')} |`;
      const tableDivider = `| ${columns.map(() => '---').join(' | ')} |`;
      const tableRows = rows
        .map((r) => `| ${columns.map((c) => String(r[c] ?? '')).join(' | ')} |`)
        .join('\n');
      markdownTable = `${tableHeader}\n${tableDivider}\n${tableRows}`;
    }

    // Narrative generation
    let narrative = '';
    try {
      const userPrompt = `User's original question: "${user_query}"\n\nQuery results:\n${markdownTable}\n\nWrite a concise professional insight based on the numbers above.`;
      const NARRATIVE_SYSTEM_PROMPT = `You are a data analyst assistant.\nYou will receive pre-calculated numbers from a trusted calculation engine.\nYour ONLY job: write ONE short, professional insight (2-3 sentences max)\nin the SAME language as the user's question.\nRules:\n- Do NOT recalculate anything.\n- Do NOT change or question the numbers.\n- Do NOT add disclaimers or explanations.\n- Just return the insight text. Nothing else.`;

      const response = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LM_STUDIO_MODEL,
          messages: [
            { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 200,
          stream: false,
        }),
      });
      if (response.ok) {
        const narrativeData = await response.json();
        narrative = narrativeData.choices?.[0]?.message?.content?.trim() ?? '';
      }
    } catch (e) {
      console.error("Narrative generation failed", e);
    }

    const finalContent = narrative ? `${narrative}\n\n${markdownTable}` : markdownTable;

    if (conversationId) {
      saveUserMessage(conversationId, user_query);
      saveAssistantMessage(
        conversationId,
        finalContent,
        result.intent as string,
        sql,
      );
    }

    return {
      intent: 'analyze',
      markdownTable,
      finalContent,
    };
  }

  throw new Error('Lỗi không xác định');
}
