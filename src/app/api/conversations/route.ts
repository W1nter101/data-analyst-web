import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileId, title } = await request.json();

  // Verify file ownership
  const file = appDb.prepare(
    'SELECT id, original_name FROM uploaded_files WHERE id = ? AND user_id = ?'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).get(fileId, session.userId) as any;
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  const convId = randomUUID();
  const convTitle = title || `Chat về ${file.original_name}`;

  appDb.prepare(`
    INSERT INTO conversations (id, user_id, file_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(convId, session.userId, fileId, convTitle, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));

  return NextResponse.json({ conversationId: convId, title: convTitle });
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const conversations = appDb.prepare(`
    SELECT c.id, c.title, c.file_id, c.created_at, c.updated_at,
           f.original_name as file_name,
           (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    JOIN uploaded_files f ON c.file_id = f.id
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC
  `).all(session.userId);

  return NextResponse.json({ conversations });
}
