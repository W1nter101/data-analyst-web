import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSession } from "@/lib/session";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export async function POST(req: NextRequest) {
  // Check authorization
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured on the server." }, { status: 500 });
  }

  const { prompt, result } = await req.json();

  const systemPrompt = `Bạn là chuyên gia phân tích dữ liệu kinh doanh.
Dựa vào kết quả tính toán bên dưới, hãy:
1. Tóm tắt số liệu chính (1-2 câu)
2. Phân tích insight quan trọng nhất (2-3 câu)
3. Đề xuất hành động tiếp theo (1-2 câu)

Viết bằng tiếng Việt, súc tích, dùng Markdown (bold cho số quan trọng).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{
        role: "user",
        parts: [{ text: `${systemPrompt}\n\nCâu hỏi gốc: "${prompt}"\nKết quả: ${JSON.stringify(result)}` }]
      }],
    });

    const insight = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return NextResponse.json({ insight });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
