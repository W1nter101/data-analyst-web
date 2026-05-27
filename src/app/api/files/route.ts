import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const files = appDb.prepare(`
    SELECT id, original_name, row_count, col_count, file_size, created_at, last_used_at
    FROM uploaded_files
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(session.userId);

  return NextResponse.json({
    files: files
  });
}
