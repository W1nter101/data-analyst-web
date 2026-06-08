import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';
import { storage } from '@/lib/storage';
import { computeKeyInfluencers } from '@/lib/keyInfluencers';

export async function POST(req: NextRequest) {
  // Auth — same pattern as every API route in the project
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId, targetColumn } = await req.json();
  if (!fileId || !targetColumn) {
    return NextResponse.json({ error: 'Missing fileId or targetColumn' }, { status: 400 });
  }

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
    // Validate targetColumn exists via PRAGMA table_info
    const tableInfo = fileDb.pragma('table_info(data)') as Array<{ name: string }>;
    const allColumns = tableInfo.map(c => c.name);

    if (!allColumns.includes(targetColumn)) {
      return NextResponse.json(
        { error: `Cột "${targetColumn}" không tồn tại trong dữ liệu.` },
        { status: 400 },
      );
    }

    // Fetch up to 5000 rows to balance accuracy vs memory
    const rows = fileDb
      .prepare('SELECT * FROM data LIMIT 5000')
      .all() as Record<string, string>[];

    if (rows.length < 5) {
      return NextResponse.json(
        { error: 'Dữ liệu quá ít (< 5 hàng) để phân tích.' },
        { status: 400 },
      );
    }

    // Compute influencers
    const results = computeKeyInfluencers(rows, targetColumn, allColumns);

    if (results.length === 0) {
      return NextResponse.json(
        { error: `Không tìm thấy tương quan đáng kể với cột "${targetColumn}".` },
        { status: 200 },
      );
    }

    return NextResponse.json({ results, rowCount: rows.length });

  } finally {
    fileDb.close(); // Always close, even on early return or throw
  }
}
