import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { importCsvToSqlite } from '@/lib/csvToSqlite';
import { getSession } from '@/lib/session';
import { storage } from '@/lib/storage';
import appDb from '@/lib/appDb';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { csvText, fileName, schema } = await request.json();

    if (!csvText) {
      return NextResponse.json(
        { error: 'csvText is required' },
        { status: 400 },
      );
    }

    const fileId = randomUUID();
    const originalFilename = fileName || 'upload.csv';

    // Populate SQLite database with the uploaded CSV data and get buffer
    const { buffer, rowCount, columns } = importCsvToSqlite(csvText);

    storage.save(session.userId, fileId, buffer);

    appDb.prepare(`
      INSERT OR IGNORE INTO users (id, email, created_at) VALUES (?, ?, ?)
    `).run(session.userId, session.email || session.userId, Math.floor(Date.now() / 1000));

    appDb.prepare(`
      INSERT INTO uploaded_files (id, user_id, original_name, storage_path, row_count, col_count, file_size, schema, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fileId,
      session.userId,
      originalFilename,
      storage.getPath(session.userId, fileId),
      rowCount,
      columns.length,
      buffer.length,
      schema || null,
      Math.floor(Date.now() / 1000)
    );

    return NextResponse.json({ success: true, fileId, columns, rowCount });
  } catch (error) {
    console.error('Upload API Error:', error);
    return NextResponse.json(
      { error: 'Failed to populate SQLite database' },
      { status: 500 },
    );
  }
}
