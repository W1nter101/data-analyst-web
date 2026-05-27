import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ convId: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { convId } = await params;

  const conv = appDb.prepare(
    'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
  ).get(convId, session.userId);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete messages first (FK cascade should handle, but be explicit)
  appDb.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);
  appDb.prepare('DELETE FROM conversations WHERE id = ?').run(convId);

  return NextResponse.json({ success: true });
}
