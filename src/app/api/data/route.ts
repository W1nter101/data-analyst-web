import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import { storage } from '@/lib/storage';
import appDb from '@/lib/appDb';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const fileId = searchParams.get('fileId');

    if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });

    const file = appDb.prepare('SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?').get(fileId, session.userId);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const dbPath = storage.getPath(session.userId, fileId);
    const db = new Database(dbPath);
    
    // Ensure original table exists for backward compatibility
    const originalExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='data_original'`).get();
    if (!originalExists) {
      db.exec(`CREATE TABLE "data_original" AS SELECT * FROM "data"`);
    }
    
    const rows = db.prepare(`SELECT rowid AS __rowid, * FROM "data" LIMIT ? OFFSET ?`).all(limit, offset);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('GET /api/data Error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { __rowid, column, value, fileId } = await req.json();

    if (__rowid === undefined || !column || !fileId) {
      return NextResponse.json({ error: 'Missing __rowid, column, or fileId' }, { status: 400 });
    }

    const file = appDb.prepare('SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?').get(fileId, session.userId);
    if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const dbPath = storage.getPath(session.userId, fileId);
    const db = new Database(dbPath);
    
    // Ensure original table exists for backward compatibility
    const originalExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='data_original'`).get();
    if (!originalExists) {
      db.exec(`CREATE TABLE "data_original" AS SELECT * FROM "data"`);
    }
    
    // Validate column exists
    const cols = db.prepare(`PRAGMA table_info("data")`).all() as { name: string }[];
    if (!cols.some(c => c.name === column)) {
      return NextResponse.json({ error: 'Column does not exist' }, { status: 400 });
    }

    const stmt = db.prepare(`UPDATE "data" SET "${column}" = ? WHERE rowid = ?`);
    const result = stmt.run(value, __rowid);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/data Error:', error);
    return NextResponse.json({ error: 'Failed to update database' }, { status: 500 });
  }
}
