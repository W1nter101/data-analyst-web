import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ convId: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { convId } = await params;

  // Verify conversation belongs to user
  const conv = appDb.prepare(
    'SELECT id, file_id FROM conversations WHERE id = ? AND user_id = ?'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).get(convId, session.userId) as any;
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const messages = appDb.prepare(`
    SELECT id, role, content, intent, sql_query, chart_config, created_at
    FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `).all(convId);

  return NextResponse.json({
    conversationId: convId,
    fileId: conv.file_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages.map((m: any) => ({
      ...m,
      chart_config: m.chart_config ? JSON.parse(m.chart_config) : null,
    }))
  });
}

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

  appDb.prepare('DELETE FROM messages WHERE conversation_id = ?').run(convId);

  return NextResponse.json({ success: true });
}
