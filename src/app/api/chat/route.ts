import { NextRequest, NextResponse } from 'next/server';

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const LM_STUDIO_MODEL =
  process.env.LM_STUDIO_MODEL || 'phi-3-mini-4k-instruct';

const SYSTEM_PROMPT = `Bạn là một AI phân tích dữ liệu bán hàng. Hãy dựa vào schema được cung cấp để chuyển đổi user_query thành cấu hình biểu đồ tương ứng. Chỉ trả về JSON hợp lệ, không thêm text nào khác.

Nếu user_query yêu cầu vẽ biểu đồ hoặc phân tích dữ liệu, trả về:
{
  "intent": "visualize",
  "chart_config": {
    "type": "Line | Bar | Pie | Scatter | Area",
    "x_axis": "<tên cột trục X>",
    "y_axis": "<tên cột trục Y>"
  }
}

Nếu user_query không liên quan đến dữ liệu hoặc không thể vẽ biểu đồ, trả về:
{
  "intent": "unknown",
  "message": "Tôi chỉ có thể giúp phân tích dữ liệu CSV và tạo biểu đồ."
}

Ví dụ các câu hỏi không liên quan: xin chào, thời tiết, nấu ăn, hỏi thăm, chuyện phiếm.`;

/**
 * Attempt to extract JSON from a string that may contain markdown
 * code fences or other wrapper text around the actual JSON.
 */
function extractJSON(raw: string): string {
  // Try to find JSON inside ```json ... ``` or ``` ... ```
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fencedMatch) return fencedMatch[1].trim();

  // Try to find the first { ... } block
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0].trim();

  return raw.trim();
}

/**
 * Send a request to LM Studio and parse the response as JSON.
 * Returns the parsed object or null if parsing fails.
 */
async function callLMStudio(
  schema: unknown,
  userQuery: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LM_STUDIO_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ schema, user_query: userQuery }),
        },
      ],
      temperature: 0.1,
      stream: false,
    }),
  });

  if (!res.ok) {
    console.error(`LM Studio returned ${res.status}: ${await res.text()}`);
    return null;
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  try {
    return JSON.parse(extractJSON(content));
  } catch {
    console.error('Failed to parse LM Studio response as JSON:', content);
    return null;
  }
}

/**
 * Validate that the parsed response has the expected shape:
 * { intent: string, chart_config: { type: string, x_axis: string, y_axis: string } }
 */
/**
 * Validate response shape. Accepts two valid intents:
 * - "visualize": must have chart_config with type, x_axis, y_axis
 * - "unknown": must have message string
 */
function isValidResponse(obj: Record<string, unknown>): boolean {
  if (typeof obj.intent !== 'string') return false;

  // Unknown intent — model says it can't help
  if (obj.intent === 'unknown') {
    return typeof obj.message === 'string';
  }

  // Visualize intent — must have chart_config
  if (obj.intent === 'visualize') {
    const cc = obj.chart_config;
    if (!cc || typeof cc !== 'object') return false;
    const config = cc as Record<string, unknown>;
    return (
      typeof config.type === 'string' &&
      typeof config.x_axis === 'string' &&
      typeof config.y_axis === 'string'
    );
  }

  return false;
}

/**
 * POST /api/chat
 *
 * Body: { schema: SchemaItem[], user_query: string }
 * Response: { intent, chart_config } or { error }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schema, user_query } = body;

    if (!schema || !user_query) {
      return NextResponse.json(
        { error: 'schema và user_query là bắt buộc' },
        { status: 400 },
      );
    }

    // Attempt 1
    let result = await callLMStudio(schema, user_query);

    // If parse failed, retry once
    if (!result) {
      console.log('Retry: first attempt returned null, retrying...');
      result = await callLMStudio(schema, user_query);
    }

    if (!result) {
      return NextResponse.json(
        { error: 'Không thể phân tích phản hồi từ AI. Hãy thử lại.' },
        { status: 502 },
      );
    }

    if (!isValidResponse(result)) {
      return NextResponse.json(
        {
          error: 'AI trả về định dạng không hợp lệ. Hãy mô tả rõ hơn.',
          raw: result,
        },
        { status: 422 },
      );
    }

    // Unknown intent — pass through message to client
    if (result.intent === 'unknown') {
      return NextResponse.json({
        intent: 'unknown',
        message: result.message || 'Tôi chỉ có thể giúp phân tích dữ liệu CSV.',
      });
    }

    // Visualize intent — pass chart_config
    return NextResponse.json({
      intent: result.intent,
      chart_config: result.chart_config,
    });
  } catch (error) {
    console.error('Chat API error:', error);

    const isConnectionError =
      error instanceof TypeError &&
      error.message.includes('fetch failed');

    if (isConnectionError) {
      return NextResponse.json(
        { error: 'Không thể kết nối đến LM Studio. Hãy kiểm tra server.' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: 'Lỗi hệ thống khi xử lý yêu cầu AI' },
      { status: 500 },
    );
  }
}
