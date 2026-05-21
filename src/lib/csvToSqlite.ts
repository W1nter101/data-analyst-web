import Papa from 'papaparse';

import { getDb } from './db';

export function importCsvToSqlite(csvString: string, tableName = 'data'): void {
  const db = getDb();
  const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true });
  const rows = parsed.data as Record<string, string>[];

  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);

  // Drop and recreate table
  db.exec(`DROP TABLE IF EXISTS "${tableName}"`);

  // Create table — all columns as TEXT first, SQLite handles casting in queries
  const colDefs = columns.map((c) => `"${c}" TEXT`).join(', ');
  db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

  // Bulk insert
  const placeholders = columns.map(() => '?').join(', ');
  const colNames = columns.map((c) => `"${c}"`).join(', ');
  const insert = db.prepare(
    `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
  );

  const insertMany = db.transaction((rows: Record<string, string>[]) => {
    for (const row of rows) {
      insert.run(columns.map((c) => row[c] ?? null));
    }
  });

  insertMany(rows);
}

export function getTableSchema(tableName = 'data'): string {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
    name: string;
    type: string;
  }[];
  return cols.map((c) => `${c.name} (${c.type})`).join(', ');
}
