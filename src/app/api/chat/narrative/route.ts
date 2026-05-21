import { NextRequest, NextResponse } from 'next/server';

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const LM_STUDIO_MODEL =
  process.env.LM_STUDIO_MODEL || 'sql-phi3';

const NARRATIVE_SYSTEM_PROMPT = `You are a data analyst assistant.
You will receive pre-calculated numbers from a trusted calculation engine.
Your ONLY job: write ONE short, professional insight (2-3 sentences max) 
in the SAME language as the user's question.
Rules:
- Do NOT recalculate anything.
- Do NOT change or question the numbers.
- Do NOT add disclaimers or explanations.
- Just return the insight text. Nothing else.`;

export async function POST(req: NextRequest) {
  try {
    const { markdownTable, user_query } = (await req.json()) as {
      markdownTable: string;
      user_query: string;
    };

    if (!markdownTable || !user_query) {
      return NextResponse.json(
        { error: 'Missing markdownTable or user_query' },
        { status: 400 },
      );
    }

    const userPrompt = `User's original question: "${user_query}"\n\nQuery results:\n${markdownTable}\n\nWrite a concise professional insight based on the numbers above.`;

    const response = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LM_STUDIO_MODEL,
        messages: [
          { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 200,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.status}`);
    }

    const data = await response.json();
    const narrative = data.choices?.[0]?.message?.content?.trim() ?? '';

    return NextResponse.json({ narrative });
  } catch (err) {
    console.error('[narrative route]', err);
    return NextResponse.json(
      { error: 'Narrative generation failed' },
      { status: 500 },
    );
  }
}

