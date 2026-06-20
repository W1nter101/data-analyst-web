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
// IMPORTANT: Use getter functions instead of module-level constants.
// ES import hoisting causes module-level const to evaluate BEFORE
// loadEnvConfig() in chatWorker.ts, making env vars undefined.
// Getters read process.env at call time, after env has been loaded.

function getLMStudioBaseUrl(): string {
  return process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
}

function getLMStudioModel(): string {
  return process.env.LM_STUDIO_MODEL || 'qwen2.5-coder-7b-instruct';
}

// NOTE: The old monolithic SYSTEM_PROMPT has been replaced by the 2-step pipeline:
// - callGeminiPlanner() builds its own prompt
// - callLocalJsonGenerator() uses LOCAL_JSON_SYSTEM
// - callGeminiDirectJson() builds its own prompt

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

// ── Pipeline Step 1: Gemini Planner ──────────────────────────────────
// Receives full schema + user query → outputs a short instruction (~20 words)
// for the local model to generate structured JSON from.
async function callGeminiPlanner(
  schemaColumns: string,
  userQuery: string,
  columnList: string[],
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[GeminiPlanner] GEMINI_API_KEY not set');
    return '';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

  const prompt = `You are a data analysis planner. Given the CSV schema and user request, determine the intent and output ONE short instruction for another model to generate a JSON config.

Available columns: ${columnList.join(', ')}
User request: "${userQuery}"

Rules:
- If user wants a chart/graph → output: "VISUALIZE: <chart_type> chart. X=<column>, Y=<aggregation>(<column>)[, color=<column>][, sort=<asc|desc|none>]"
- If user wants data analysis (ranking, comparison, summary, trend) → output: "ANALYZE: <operation>. metric=<column>, group_by=<column>, aggregation=<function>[, limit=<N>][, filters=<col>:<op>:<val>]"
- If user wants to transform data (add/rename/delete column, fill empty) → output: "TRANSFORM: <operation>. column=<name>[, expression=<expr>][, new_name=<name>][, data_type=<type>]"
- If user wants key influencers/correlation → output: "KEY_INFLUENCERS: targetColumn=<column>"
- If not data-related → output: "UNKNOWN"

Use ONLY exact column names from the available columns list.
Output the instruction only. No explanation. No markdown.`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100, temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      console.error(`[GeminiPlanner] HTTP ${res.status}: ${await res.text()}`);
      return '';
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    console.log('[GeminiPlanner] instruction:', text);
    return text;
  } catch (err) {
    console.error('[GeminiPlanner] fetch error:', err);
    return '';
  }
}

// ── Pipeline Step 2: Local Model JSON Generator ─────────────────────
// Receives a short instruction → generates structured JSON config.
async function callLocalJsonGenerator(
  instruction: string,
): Promise<Record<string, unknown> | null> {
  const LOCAL_JSON_SYSTEM = `You are a JSON generator. Given a short instruction, return ONLY a valid JSON object.

If instruction starts with "VISUALIZE:":
{"intent":"visualize","chart_config":{"type":"Bar|Line|Pie|Scatter|Area","x_axis":"<col>","y_axis":"<col>","title":"<title>","aggregation":{"function":"sum|avg|count|min|max","group_by":"<col>"},"filters":[],"color_by":null,"sort":"none"}}

If instruction starts with "ANALYZE:":
{"intent":"analyze","analysis_config":{"operation":"rank|compare|summary|trend","metric":"<col>","group_by":"<col>","aggregation":"sum|avg|count|min|max","limit":null,"filters":[]}}

If instruction starts with "TRANSFORM:":
{"intent":"transform","transform_config":{"operation":"add_column|rename_column|delete_column|fill_empty","column_name":"<col>","expression":"<expr>","new_name":"<name>","data_type":"REAL|TEXT|INTEGER","description":"<desc>"}}

If instruction starts with "KEY_INFLUENCERS:":
{"intent":"key_influencers","targetColumn":"<col>"}

If instruction starts with "UNKNOWN":
{"intent":"unknown","message":"Tôi chỉ có thể giúp phân tích dữ liệu CSV."}

Return JSON only. No explanation. No markdown.`;

  try {
    const res = await fetch(`${getLMStudioBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getLMStudioModel(),
        messages: [
          { role: 'system', content: LOCAL_JSON_SYSTEM },
          { role: 'user', content: instruction },
        ],
        max_tokens: 300,
        temperature: 0.1,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "chart_config",
            strict: true,
            schema: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["bar", "line", "pie", "area"] },
                x: { type: "string" },
                y: { type: "string" },
                aggregation: { type: "string", enum: ["sum", "count", "avg", "max", "min"] },
                color_by: { type: ["string", "null"] }
              },
              required: ["type", "x", "y", "aggregation"],
              additionalProperties: false
            }
          }
        },
      }),
    });

    if (!res.ok) {
      console.error(`[LocalJsonGen] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? '';
    console.log('[LocalJsonGen] raw:', rawContent);

    // Check for truncation
    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('[LocalJsonGen] Response truncated (finish_reason=length)');
    }

    const parsed = extractJson(rawContent);
    if (!parsed) {
      console.error('[LocalJsonGen] Failed to extract JSON:', rawContent);
      return null;
    }

    const sanitized = sanitizeAIResponse(parsed as Record<string, unknown>);
    console.log('[LocalJsonGen] sanitized:', sanitized);
    return sanitized;
  } catch (err) {
    console.error('[LocalJsonGen] fetch error:', err);
    return null;
  }
}

// ── Fallback: Gemini Direct JSON ────────────────────────────────────
// If local model fails, Gemini generates the full JSON config directly.
async function callGeminiDirectJson(
  instruction: string,
  columnList: string[],
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[GeminiFallback] GEMINI_API_KEY not set');
    return null;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

  const prompt = `Convert this instruction into a JSON config object.
Available columns: ${columnList.join(', ')}
Instruction: ${instruction}

If instruction starts with "VISUALIZE:":
{"intent":"visualize","chart_config":{"type":"Bar","x_axis":"<col>","y_axis":"<col>","title":"<title>","aggregation":{"function":"sum","group_by":"<col>"},"filters":[],"color_by":null,"sort":"none"}}

If instruction starts with "ANALYZE:":
{"intent":"analyze","analysis_config":{"operation":"rank","metric":"<col>","group_by":"<col>","aggregation":"sum","limit":null,"filters":[]}}

If instruction starts with "TRANSFORM:":
{"intent":"transform","transform_config":{"operation":"add_column","column_name":"<col>","expression":"<expr>","new_name":null,"data_type":"REAL","description":"<desc>"}}

If instruction starts with "KEY_INFLUENCERS:":
{"intent":"key_influencers","targetColumn":"<col>"}

If instruction starts with "UNKNOWN":
{"intent":"unknown","message":"Tôi chỉ có thể giúp phân tích dữ liệu CSV."}

Return ONLY valid JSON. No explanation.`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      console.error(`[GeminiFallback] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    console.log('[GeminiFallback] raw:', rawContent);

    const parsed = extractJson(rawContent);
    if (!parsed) {
      console.error('[GeminiFallback] Failed to extract JSON:', rawContent);
      return null;
    }

    const sanitized = sanitizeAIResponse(parsed as Record<string, unknown>);
    console.log('[GeminiFallback] sanitized:', sanitized);
    return sanitized;
  } catch (err) {
    console.error('[GeminiFallback] fetch error:', err);
    return null;
  }
}

// ── Fallback: Call Local Model Directly (no Gemini) ─────────────────
// Used when Gemini Planner is unavailable (invalid API key, network error).
// Uses a compact system prompt (~400 tokens) that Qwen 7B can handle.
async function callLocalDirect(
  userQuery: string,
  columnList: string[],
): Promise<Record<string, unknown> | null> {
  const COMPACT_SYSTEM = `You are a JSON generator for data analysis. Given a user query and column list, return ONLY valid JSON.

Available columns: ${columnList.join(', ')}

Rules - detect intent from user query:
- Chart/graph request → {"intent":"visualize","chart_config":{"type":"Bar|Line|Pie|Scatter|Area","x_axis":"<col>","y_axis":"<col>","title":"<title>","aggregation":{"function":"sum|avg|count","group_by":"<col>"},"filters":[],"color_by":null,"sort":"none"}}
- Data question (ranking/comparison/summary) → {"intent":"analyze","analysis_config":{"operation":"rank|compare|summary|trend","metric":"<col>","group_by":"<col>","aggregation":"sum|avg|count","limit":null,"filters":[]}}
- Add/rename/delete column → {"intent":"transform","transform_config":{"operation":"add_column|rename_column|delete_column|fill_empty","column_name":"<col>","expression":"<expr>","new_name":null,"data_type":"REAL","description":"<desc>"}}
- Column correlation/influence → {"intent":"key_influencers","targetColumn":"<col>"}
- Not data-related → {"intent":"unknown","message":"Tôi chỉ có thể giúp phân tích dữ liệu CSV."}

Use EXACT column names from available columns. Return JSON only.`;

  try {
    const res = await fetch(`${getLMStudioBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getLMStudioModel(),
        messages: [
          { role: 'system', content: COMPACT_SYSTEM },
          { role: 'user', content: userQuery },
        ],
        max_tokens: 500,
        temperature: 0.1,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "chart_config",
            strict: true,
            schema: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["bar", "line", "pie", "area"] },
                x: { type: "string" },
                y: { type: "string" },
                aggregation: { type: "string", enum: ["sum", "count", "avg", "max", "min"] },
                color_by: { type: ["string", "null"] }
              },
              required: ["type", "x", "y", "aggregation"],
              additionalProperties: false
            }
          }
        },
      }),
    });

    if (!res.ok) {
      console.error(`[LocalDirect] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? '';
    console.log('[LocalDirect] raw:', rawContent);

    const finishReason = data?.choices?.[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('[LocalDirect] Response truncated (finish_reason=length)');
    }

    const parsed = extractJson(rawContent);
    if (!parsed) {
      console.error('[LocalDirect] Failed to extract JSON:', rawContent);
      return null;
    }

    const sanitized = sanitizeAIResponse(parsed as Record<string, unknown>);
    console.log('[LocalDirect] sanitized:', sanitized);
    return sanitized;
  } catch (err) {
    console.error('[LocalDirect] fetch error:', err);
    return null;
  }
}

// ── Combined Pipeline: Planner → Generator → Fallback ───────────────
async function callAIPipeline(
  schema: unknown,
  userQuery: string,
  columnList: string[],
): Promise<Record<string, unknown> | null> {
  // Step 1: Gemini plans the instruction
  const schemaShort = columnList.join(', ');
  const instruction = await callGeminiPlanner(schemaShort, userQuery, columnList);

  if (instruction) {
    // Step 2: Local model generates JSON from instruction
    let result = await callLocalJsonGenerator(instruction);

    if (result) {
      console.log('[Pipeline] Local model succeeded');
      return result;
    }

    // Step 3: Retry local model once
    console.log('[Pipeline] Local model failed, retrying...');
    result = await callLocalJsonGenerator(instruction);

    if (result) {
      console.log('[Pipeline] Local model succeeded on retry');
      return result;
    }

    // Step 4: Fallback to Gemini direct JSON
    console.log('[Pipeline] Local model failed twice, falling back to Gemini direct JSON');
    result = await callGeminiDirectJson(instruction, columnList);

    if (result) {
      console.log('[Pipeline] Gemini fallback succeeded');
      return result;
    }
  } else {
    console.warn('[Pipeline] Gemini planner unavailable, falling back to local-only mode');
  }

  // Step 5: Final fallback — call local model directly with compact prompt
  // This handles the case where Gemini API is down/invalid key
  console.log('[Pipeline] Trying local model direct (compact prompt)...');
  let result = await callLocalDirect(userQuery, columnList);

  if (result) {
    console.log('[Pipeline] Local direct succeeded');
    return result;
  }

  // One more retry for local direct
  console.log('[Pipeline] Local direct failed, retrying...');
  result = await callLocalDirect(userQuery, columnList);

  if (result) {
    console.log('[Pipeline] Local direct succeeded on retry');
    return result;
  }

  console.error('[Pipeline] All attempts failed');
  return null;
}

function sanitizeValue(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  if (val.includes('|')) {
    const parts = val.split('|').map(p => p.trim());
    return parts[0] || fallback;
  }
  return val;
}

export function sanitizeAIResponse(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;

  const validTypes = ['bar', 'line', 'pie', 'area', 'scatter'];

  // Normalize flat format: { type, x, y, ... } to nested format
  if (!obj.intent && typeof obj.type === 'string' && validTypes.includes(obj.type.toLowerCase())) {
    obj.intent = 'visualize';
    const aggVal = typeof obj.aggregation === 'string' ? obj.aggregation : 'sum';
    obj.chart_config = {
      type: obj.type,
      x_axis: obj.x,
      y_axis: obj.y,
      aggregation: {
        function: aggVal,
        group_by: obj.x
      },
      color_by: obj.color_by || null,
      filters: [],
      sort: 'none'
    };
  }

  if (typeof obj.intent === 'string' && obj.intent.includes('|')) {
    obj.intent = sanitizeValue(obj.intent, 'unknown');
  }

  // 1. Sanitize visualize config
  if (obj.intent === 'visualize' && obj.chart_config && typeof obj.chart_config === 'object') {
    const cc = obj.chart_config as Record<string, unknown>;
    
    // Also normalize if nested chart_config has x/y instead of x_axis/y_axis
    if (cc.x && !cc.x_axis) cc.x_axis = cc.x;
    if (cc.y && !cc.y_axis) cc.y_axis = cc.y;

    cc.type = sanitizeValue(cc.type, 'Bar');
    
    if (cc.aggregation && typeof cc.aggregation === 'object') {
      const agg = cc.aggregation as Record<string, unknown>;
      agg.function = sanitizeValue(agg.function, 'sum');
    }
    
    const filters = cc.filters;
    if (Array.isArray(filters)) {
      filters.forEach((f) => {
        if (f && typeof f === 'object') {
          const filterObj = f as Record<string, unknown>;
          filterObj.operator = sanitizeValue(filterObj.operator, 'eq');
        }
      });
    }

    if (cc.sort) {
      cc.sort = sanitizeValue(cc.sort, 'none');
    }
  }

  // 2. Sanitize analyze config
  if (obj.intent === 'analyze' && obj.analysis_config && typeof obj.analysis_config === 'object') {
    const ac = obj.analysis_config as Record<string, unknown>;
    ac.operation = sanitizeValue(ac.operation, 'summary');
    ac.aggregation = sanitizeValue(ac.aggregation, 'sum');
    
    const filters = ac.filters;
    if (Array.isArray(filters)) {
      filters.forEach((f) => {
        if (f && typeof f === 'object') {
          const filterObj = f as Record<string, unknown>;
          filterObj.operator = sanitizeValue(filterObj.operator, 'eq');
        }
      });
    }
  }

  // 3. Sanitize transform config
  if (obj.intent === 'transform' && obj.transform_config && typeof obj.transform_config === 'object') {
    const tc = obj.transform_config as Record<string, unknown>;
    tc.operation = sanitizeValue(tc.operation, 'add_column');
  }

  return obj;
}

export function isValidResponse(obj: Record<string, unknown> | null | undefined): boolean {
  console.log("isValidResponse checking object:", JSON.stringify(obj, null, 2));
  if (!obj || typeof obj !== 'object') return false;

  const validTypes = ['bar', 'line', 'pie', 'area', 'scatter'];

  const typeVal = obj.type;
  const xVal = obj.x;
  const yVal = obj.y;

  // Check if it is a flat response
  const isFlatChart = typeof typeVal === 'string' && validTypes.includes(typeVal.toLowerCase());
  if (isFlatChart) {
    if (!xVal || typeof xVal !== 'string') return false;
    if (!yVal || typeof yVal !== 'string') return false;
    return true;
  }

  // Check for nested structure or other intents
  const intentVal = obj.intent;
  if (typeof intentVal !== 'string') return false;

  if (intentVal === 'unknown') {
    return typeof obj.message === 'string';
  }

  if (intentVal === 'visualize') {
    const cc = obj.chart_config;
    if (!cc || typeof cc !== 'object') return false;
    const config = cc as Record<string, unknown>;
    
    // Support either type/x_axis/y_axis or type/x/y
    const type = (config.type || typeVal) as string;
    if (!type || !validTypes.includes(type.toLowerCase())) return false;

    const x = (config.x_axis || config.x || xVal) as string;
    if (!x || typeof x !== 'string') return false;

    const y = (config.y_axis || config.y || yVal) as string;
    if (!y || typeof y !== 'string') return false;

    return true;
  }

  if (intentVal === 'analyze') {
    const ac = obj.analysis_config;
    if (!ac || typeof ac !== 'object') return false;
    const config = ac as Record<string, unknown>;
    return (
      typeof config.operation === 'string' &&
      typeof config.metric === 'string'
    );
  }

  if (intentVal === 'transform') {
    const tc = obj.transform_config;
    if (!tc || typeof tc !== 'object') return false;
    const config = tc as Record<string, unknown>;
    return (
      typeof config.operation === 'string' &&
      typeof config.column_name === 'string'
    );
  }

  if (intentVal === 'key_influencers') {
    const targetColumnVal = obj.targetColumn;
    return typeof targetColumnVal === 'string' && targetColumnVal.length > 0;
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

  // ─── FORECAST REGEX BYPASS ──────────────────────────────────────
  // Detects forecast/prediction intent without LLM call.
  // Falls through to LLM if no date column is found in schema.
  const FORECAST_REGEX =
    /dự báo|dự đoán|forecast|xu hướng tương lai|tháng tới|quý tới|năm tới|tuần tới|sẽ như thế nào|predict|sẽ đạt bao nhiêu|sẽ là bao nhiêu/i;

  if (FORECAST_REGEX.test(user_query)) {
    const schemaArr = schema as Array<{ column_name: string; data_type: string }>;

    if (Array.isArray(schemaArr)) {
      // Find dateColumn: type 'date' or name matches date-related keywords
      const dateCol = schemaArr.find(
        (c) =>
          c.data_type === 'date' ||
          /date|ngày|tháng|time|period|month|year/i.test(c.column_name),
      );

      // Find valueColumn: numeric column mentioned in query, fallback first numeric
      const numericCols = schemaArr.filter(
        (c) =>
          c.data_type === 'number' ||
          c.data_type === 'REAL' ||
          c.data_type === 'INTEGER',
      );
      const valueCol =
        numericCols.find((c) =>
          user_query.toLowerCase().includes(c.column_name.toLowerCase()),
        ) ?? numericCols[0];

      // Detect horizon from query
      const horizonMatch =
        user_query.match(/(\d+)\s*(tháng|month)/i) ||
        user_query.match(/(\d+)\s*(năm|year)/i) ||
        user_query.match(/(\d+)\s*(quý|quarter)/i) ||
        user_query.match(/(\d+)\s*(tuần|week)/i);
      let horizon = 3;
      if (horizonMatch) {
        const n = parseInt(horizonMatch[1]);
        const unit = horizonMatch[2].toLowerCase();
        horizon =
          unit.includes('quý') || unit.includes('quarter') ? n * 3 : n;
        horizon = Math.max(1, Math.min(12, horizon));
      }

      if (dateCol && valueCol) {
        console.log(
          `[FORECAST REGEX] Bypassed LLM → dateColumn: "${dateCol.column_name}", valueColumn: "${valueCol.column_name}", horizon: ${horizon}`,
        );
        if (conversationId) {
          saveUserMessage(conversationId, user_query);
          saveAssistantMessage(
            conversationId,
            `Dự báo: ${valueCol.column_name} theo ${dateCol.column_name}`,
            'forecast',
          );
        }
        return {
          intent: 'forecast' as const,
          dateColumn: dateCol.column_name,
          valueColumn: valueCol.column_name,
          horizon,
        };
      }
      // If dateCol not found → fall through to LLM
    }
  }
  // ───────────────────────────────────────────────────────────────────

  // ── Call AI Pipeline (Gemini Planner → Local JSON → Gemini Fallback)
  const result = await callAIPipeline(schema, user_query, columnList);

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
    const tc = result.transform_config as Record<string, unknown>;
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

      const response = await fetch(`${getLMStudioBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: getLMStudioModel(),
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
