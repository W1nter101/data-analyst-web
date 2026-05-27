import fs from 'fs';
import path from 'path';
import appDb from './appDb';
import { cleanupOldFiles } from './cleanupOldFiles';

export function runMigrations(): void {
  if ((globalThis as unknown as { _migrationsRan: boolean })._migrationsRan) return;

  const migrationsDir = path.join(process.cwd(), 'src/lib/migrations');

  appDb.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name   TEXT PRIMARY KEY,
      ran_at INTEGER DEFAULT (unixepoch())
    )
  `);

  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    const already = appDb
      .prepare('SELECT 1 FROM _migrations WHERE name = ?')
      .get(file);
    if (already) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    appDb.exec(sql);
    appDb.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    console.log(`[migration] ran: ${file}`);
  }

  (globalThis as unknown as { _migrationsRan: boolean })._migrationsRan = true;

  // Thêm vào cuối hàm runMigrations(), sau dòng _migrationsRan = true
  cleanupOldFiles().catch(e => console.warn('[cleanup] error:', e));
}
