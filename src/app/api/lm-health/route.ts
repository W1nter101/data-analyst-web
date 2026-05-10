import { NextResponse } from 'next/server';

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';

/**
 * GET /api/lm-health
 *
 * Pings LM Studio to check if it's running and has models loaded.
 * Called by LeftPanel on mount and every 30 seconds.
 */
export async function GET() {
  try {
    const res = await fetch(`${LM_STUDIO_BASE_URL}/models`, {
      signal: AbortSignal.timeout(3000), // 3s timeout
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: 'error', message: `LM Studio returned ${res.status}` },
        { status: 200 }, // Always 200 to client — status is in the body
      );
    }

    const data = await res.json();
    const models = data?.data?.map(
      (m: { id: string }) => m.id,
    ) ?? [];

    return NextResponse.json({ status: 'ok', models });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Không thể kết nối đến LM Studio' },
      { status: 200 },
    );
  }
}
