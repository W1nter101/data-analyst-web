import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import { storage } from '@/lib/storage';
import appDb from '@/lib/appDb';
import { executeTransform } from '@/lib/transformExecutor';
import { buildColumnSchemas } from '@/lib/csv/schema';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { fileId, transform_config } = body;

    if (!fileId || !transform_config) {
      return NextResponse.json(
        { error: 'fileId và transform_config là bắt buộc' },
        { status: 400 },
      );
    }

    // Verify ownership
    const file = appDb.prepare(
      'SELECT id, schema FROM uploaded_files WHERE id = ? AND user_id = ?'
    ).get(fileId, session.userId) as { id: string; schema: string } | undefined;

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const dbPath = storage.getPath(session.userId, fileId);

    // Get current columns from sqlite before transform
    const db = new Database(dbPath);
    const cols = db.prepare(`PRAGMA table_info("data")`).all() as { name: string; type: string }[];
    db.close();

    const currentSchema = cols.map((c) => ({
      column_name: c.name,
      type: c.type,
    }));

    // Execute transform synchronously
    const result = executeTransform(dbPath, transform_config, currentSchema);

    if (result.success) {
      // Re-open database to recalculate the schema cache
      const newDb = new Database(dbPath);
      const newCols = newDb.prepare(`PRAGMA table_info("data")`).all() as { name: string; type: string }[];
      const headers = newCols.map((c) => c.name);
      
      // Fetch all rows to compute stats (null counts, unique counts, min/max, samples)
      const rows = newDb.prepare(`SELECT * FROM "data"`).all() as Record<string, unknown>[];
      newDb.close();

      // Convert all row values to string to prevent "raw.trim is not a function" in schema.ts
      const stringRows = rows.map(row => {
        const newRow: Record<string, string> = {};
        for (const key of Object.keys(row)) {
          newRow[key] = row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
        }
        return newRow;
      });

      const newColumnSchemas = buildColumnSchemas(headers, stringRows);

      // Save updated schema cache to central appDb
      appDb.prepare(`
        UPDATE uploaded_files 
        SET col_count = ?, schema = ?
        WHERE id = ? AND user_id = ?
      `).run(headers.length, JSON.stringify(newColumnSchemas), fileId, session.userId);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Transform API POST error:', error);
    return NextResponse.json(
      { success: false, message: `Lỗi hệ thống: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
