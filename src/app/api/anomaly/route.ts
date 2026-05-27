import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { getSession } from '@/lib/session';
import { storage } from '@/lib/storage';
import appDb from '@/lib/appDb';
import { detectAnomalies } from '@/lib/anomalyDetector';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileId, method = 'zscore', threshold = 3 } = await req.json();
    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    // Verify file ownership
    const file = appDb
      .prepare(
        `SELECT id, schema FROM uploaded_files WHERE id = ? AND user_id = ?`,
      )
      .get(fileId, session.userId) as
      | { id: string; schema: string | null }
      | undefined;

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Get numeric column names from schema
    let numericColumns: string[] = [];
    if (file.schema) {
      try {
        const schema = JSON.parse(file.schema) as {
          name: string;
          type: string;
        }[];
        numericColumns = schema
          .filter((col) => col.type === 'number')
          .map((col) => col.name);
      } catch {
        // Schema parse failed — no numeric columns detectable
      }
    }

    if (numericColumns.length === 0) {
      return NextResponse.json({ results: [], message: 'No numeric columns found' });
    }

    // Read data from SQLite
    const dbPath = storage.getPath(session.userId, fileId);
    const db = new Database(dbPath);

    // Limit to 10000 rows for performance
    const rows = db
      .prepare(`SELECT * FROM "data" LIMIT 10000`)
      .all() as Record<string, string>[];
    db.close();

    const results = detectAnomalies(rows, numericColumns, method, threshold);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('POST /api/anomaly Error:', error);
    return NextResponse.json(
      { error: 'Failed to run anomaly detection' },
      { status: 500 },
    );
  }
}
