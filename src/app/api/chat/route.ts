import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import appDb from '@/lib/appDb';
import { storage } from '@/lib/storage';
import { chatQueue } from '@/lib/queue';

export const runtime = 'nodejs';

/**
 * POST /api/chat
 *
 * Non-blocking: validates input, enqueues a BullMQ job, and returns
 * { jobId, status: 'queued' } immediately.
 *
 * The frontend polls GET /api/job/[jobId] until the worker finishes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId, schema, user_query, conversationId } = body;

    // ── Auth ──────────────────────────────────────────────────────
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validate input ────────────────────────────────────────────
    if (!fileId || !schema || !user_query) {
      return NextResponse.json(
        { error: 'fileId, schema và user_query là bắt buộc' },
        { status: 400 },
      );
    }

    // ── Verify file belongs to user ───────────────────────────────
    const fileMeta = appDb.prepare(
      'SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?'
    ).get(fileId, session.userId);
    if (!fileMeta) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // ── Compute derived data needed by the worker ─────────────────
    const dbPath = storage.getPath(session.userId, fileId);

    const columnList: string[] = Array.isArray(schema)
      ? schema.map((s: { column_name?: string }) => s.column_name ?? '').filter(Boolean)
      : [];

    // ── Enqueue job ───────────────────────────────────────────────
    const job = await chatQueue.add('query', {
      schema,
      user_query,
      fileId,
      conversationId: conversationId || null,
      dbPath,
      columnList,
    });

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
    });
  } catch (error) {
    console.error('Chat API enqueue error:', error);
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi xử lý yêu cầu AI' },
      { status: 500 },
    );
  }
}