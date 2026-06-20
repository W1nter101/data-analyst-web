import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';
import { storage } from '@/lib/storage';
import { computeForecast } from '@/lib/forecast';

export async function POST(req: NextRequest) {
  // Auth — same pattern as every API route in the project
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId, dateColumn, valueColumn, horizon } = await req.json();
  if (!fileId || !dateColumn || !valueColumn) {
    return NextResponse.json(
      { error: 'Missing fileId, dateColumn, or valueColumn' },
      { status: 400 },
    );
  }

  // Validate horizon
  const parsedHorizon = Math.max(1, Math.min(12, Number(horizon) || 3));

  // Validate file ownership — appDb singleton, do NOT close
  const file = appDb
    .prepare('SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?')
    .get(fileId, session.userId) as { id: string } | undefined;

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Open file's SQLite DB — use storage.getPath()
  const dbPath = storage.getPath(session.userId, fileId);
  const fileDb = new Database(dbPath, { readonly: true });

  try {
    // Validate both columns exist via PRAGMA table_info
    const tableInfo = fileDb.pragma('table_info(data)') as Array<{ name: string }>;
    const allColumns = tableInfo.map((c) => c.name);

    if (!allColumns.includes(dateColumn)) {
      return NextResponse.json(
        { error: `Cột "${dateColumn}" không tồn tại trong dữ liệu.` },
        { status: 400 },
      );
    }

    if (!allColumns.includes(valueColumn)) {
      return NextResponse.json(
        { error: `Cột "${valueColumn}" không tồn tại trong dữ liệu.` },
        { status: 400 },
      );
    }

    // Fetch up to 5000 rows — only the two columns needed
    const rows = fileDb
      .prepare(`SELECT "${dateColumn}", "${valueColumn}" FROM data LIMIT 5000`)
      .all() as Record<string, unknown>[];

    if (rows.length < 3) {
      return NextResponse.json(
        { error: 'Dữ liệu quá ít để tạo dự báo.' },
        { status: 400 },
      );
    }

    // Compute forecast
    const result = computeForecast({
      dateColumn,
      valueColumn,
      horizon: parsedHorizon,
      rows,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } finally {
    fileDb.close(); // Always close, even on early return or throw
  }
}
