import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';
import { storage } from '@/lib/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await params;

  // Verify ownership
  const file = appDb.prepare(
    'SELECT id, original_name, row_count, schema FROM uploaded_files WHERE id = ? AND user_id = ?'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).get(fileId, session.userId) as any;

  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ 
    success: true, 
    file: {
      id: file.id,
      original_name: file.original_name,
      row_count: file.row_count,
      schema: file.schema ? JSON.parse(file.schema) : []
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId } = await params;

  // Verify ownership
  const file = appDb.prepare(
    'SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?'
  ).get(fileId, session.userId);

  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete physical file first, then metadata
  storage.delete(session.userId, fileId);
  appDb.prepare('DELETE FROM uploaded_files WHERE id = ?').run(fileId);

  return NextResponse.json({ success: true });
}
