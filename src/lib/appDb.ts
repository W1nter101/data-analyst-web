import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), '.data');
const DB_PATH = path.join(DB_DIR, 'app.sqlite');

fs.mkdirSync(DB_DIR, { recursive: true });

const appDb = new Database(DB_PATH);
appDb.pragma('journal_mode = WAL');
appDb.pragma('foreign_keys = ON');

export default appDb;
