import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ convId: string; messageId: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { convId, messageId } = await params;

  // Verify conversation belongs to user
  const conv = appDb.prepare(
    'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
  ).get(convId, session.userId);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete the specific message
  const result = appDb.prepare(
    'DELETE FROM messages WHERE id = ? AND conversation_id = ?'
  ).run(messageId, convId);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
