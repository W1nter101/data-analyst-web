import { NextRequest, NextResponse } from 'next/server';
import { generateNarrative } from '@/lib/narrativeHelper';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, chartType, xColumn, yColumn, topValues } = body;

    if (!title || !chartType || !Array.isArray(topValues)) {
      return NextResponse.json({ narrative: null });
    }

    // Convert topValues structure if needed or mock rows to let generateNarrative do the work
    // Or we can call generateNarrative with a reconstructed array of records
    const rows = topValues.map((v: { x: string; y: number }) => ({
      [xColumn || 'x']: v.x,
      [yColumn || 'y']: v.y,
    }));

    const narrative = await generateNarrative(
      title,
      chartType,
      xColumn || 'x',
      yColumn || 'y',
      rows
    );

    return NextResponse.json({ narrative });
  } catch (err) {
    console.error('Smart Narrative endpoint error:', err);
    return NextResponse.json({ narrative: null });
  }
}
