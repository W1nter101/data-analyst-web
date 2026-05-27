import { getTableSchema } from './csvToSqlite';
import Database from 'better-sqlite3';

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL ?? 'http://localhost:1234/v1';
const MODEL = process.env.LM_STUDIO_MODEL ?? 'sql-phi3';

export interface SqlResult {
  sql: string;
  rows: Record<string, unknown>[];
  error?: string;
}

export async function generateAndRunSql(
  dbPath: string,
  userQuestion: string,
  tableName = 'data',
): Promise<SqlResult> {
  const schema = getTableSchema(dbPath, tableName);

  const systemPrompt = `You are a SQL expert. Generate a single SQLite SELECT query.
Table name: "${tableName}"
Columns: ${schema}

Rules:
- Return ONLY the SQL query, no explanation, no markdown, no backticks
- Use CAST(REPLACE(col, ',', '') AS REAL) when aggregating numeric columns that may contain comma separators
- Always use double quotes for column names with spaces
- LIMIT results to 20 rows maximum unless user specifies otherwise`;

  const userPrompt = `Question: ${userQuestion}`;

  const response = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 150,
      stop: ['\n\n', ';'],
      stream: false,
    }),
  });

  const data = await response.json();
  let sql = data.choices?.[0]?.message?.content?.trim() ?? '';

  // Clean up common model artifacts
  sql = sql.replace(/^```sql\s*/i, '').replace(/```$/, '').trim();
  if (!sql.toLowerCase().startsWith('select')) {
    return { sql, rows: [], error: 'Model did not return a SELECT query' };
  }

  // Execute
  return executeSql(dbPath, sql);
}

export function executeSql(dbPath: string, sql: string, tableName = 'data'): SqlResult {
  try {
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(sql).all() as Record<string, unknown>[];
    db.close();
    return { sql, rows };
  } catch (err) {
    return { sql, rows: [], error: String(err) };
  }
}
