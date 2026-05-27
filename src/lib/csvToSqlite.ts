import Database from 'better-sqlite3';
import Papa from 'papaparse';

export function importCsvToSqlite(csvString: string, tableName = 'data'): { buffer: Buffer, rowCount: number, columns: string[] } {
  const db = new Database(':memory:');
  const parsed = Papa.parse(csvString, { header: true, skipEmptyLines: true });
  const rows = parsed.data as Record<string, string>[];

  if (rows.length === 0) {
    const buffer = db.serialize();
    db.close();
    return { buffer, rowCount: 0, columns: [] };
  }

  const columns = Object.keys(rows[0]);

  db.exec(`DROP TABLE IF EXISTS "${tableName}"`);

  const colDefs = columns.map((c) => `"${c}" TEXT`).join(', ');
  db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

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

  db.exec(`DROP TABLE IF EXISTS "${tableName}_original"`);
  db.exec(`CREATE TABLE "${tableName}_original" AS SELECT * FROM "${tableName}"`);

  const buffer = db.serialize();
  db.close();

  return { buffer, rowCount: rows.length, columns };
}

export function getTableSchema(dbPath: string, tableName = 'data'): string {
  const db = new Database(dbPath, { readonly: true });
  const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
    name: string;
    type: string;
  }[];
  db.close();
  return cols.map((c) => `${c.name} (${c.type})`).join(', ');
}
