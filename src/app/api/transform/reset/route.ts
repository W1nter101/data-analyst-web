import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import { storage } from '@/lib/storage';
import appDb from '@/lib/appDb';
import { buildColumnSchemas } from '@/lib/csv/schema';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId là bắt buộc' },
        { status: 400 },
      );
    }

    // Verify ownership
    const file = appDb.prepare(
      'SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?'
    ).get(fileId, session.userId);

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const dbPath = storage.getPath(session.userId, fileId);
    const db = new Database(dbPath);

    // Verify data_original exists
    const originalExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='data_original'`).get();
    if (!originalExists) {
      db.close();
      return NextResponse.json(
        { success: false, message: 'Không tìm thấy dữ liệu gốc để khôi phục' },
        { status: 400 },
      );
    }

    // Reconstruct data from data_original
    db.exec(`DROP TABLE IF EXISTS "data"`);
    db.exec(`CREATE TABLE "data" AS SELECT * FROM "data_original"`);

    // Recalculate columns and rows
    const newCols = db.prepare(`PRAGMA table_info("data")`).all() as { name: string; type: string }[];
    const headers = newCols.map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM "data"`).all() as Record<string, unknown>[];
    db.close();

    // Convert all row values to string to prevent "raw.trim is not a function" in schema.ts
    const stringRows = rows.map(row => {
      const newRow: Record<string, string> = {};
      for (const key of Object.keys(row)) {
        newRow[key] = row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
      }
      return newRow;
    });

    const newColumnSchemas = buildColumnSchemas(headers, stringRows);

    // Save recalculated schema back to central appDb
    appDb.prepare(`
      UPDATE uploaded_files 
      SET col_count = ?, schema = ?
      WHERE id = ? AND user_id = ?
    `).run(headers.length, JSON.stringify(newColumnSchemas), fileId, session.userId);

    return NextResponse.json({ success: true, message: 'Đã khôi phục dữ liệu gốc' });
  } catch (error) {
    console.error('Transform Reset API POST error:', error);
    return NextResponse.json(
      { success: false, message: `Lỗi hệ thống: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
