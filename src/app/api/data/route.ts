import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const db = getDb();
    const rows = db.prepare(`SELECT rowid AS __rowid, * FROM "data" LIMIT ? OFFSET ?`).all(limit, offset);

    return NextResponse.json({ rows });
  } catch (error) {
    console.error('GET /api/data Error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { __rowid, column, value } = await req.json();

    if (__rowid === undefined || !column) {
      return NextResponse.json({ error: 'Missing __rowid or column' }, { status: 400 });
    }

    const db = getDb();
    
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
