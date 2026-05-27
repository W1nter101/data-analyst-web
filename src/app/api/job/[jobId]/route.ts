import { NextRequest, NextResponse } from 'next/server';
import { chatQueue } from '@/lib/queue';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  
  try {
    const job = await chatQueue.getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const state = await job.getState();

    if (state === 'completed') {
      return NextResponse.json({
        status: 'completed',
        result: job.returnvalue,
      });
    }

    if (state === 'failed') {
      return NextResponse.json({
        status: 'failed',
        error: job.failedReason ?? 'Unknown error',
      });
    }

    // 'waiting' | 'active' | 'delayed' | 'prioritized'
    return NextResponse.json({ status: state });
  } catch (err) {
    console.error('[job-status] Error fetching job:', err);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 },
    );
  }
}
