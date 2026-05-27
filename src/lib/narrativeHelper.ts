/**
 * narrativeHelper.ts — Helper to process chart data and call LM Studio
 * directly for narrative commentary.
 *
 * Designed to run in Node.js (in both the API route and the BullMQ worker)
 * without requiring Next.js relative fetch bases.
 */

const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1';
const LM_STUDIO_MODEL =
  process.env.LM_STUDIO_MODEL || 'sql-phi3';

export async function generateNarrative(
  title: string,
  chartType: string,
  xColumn: string,
  yColumn: string,
  rows: Record<string, unknown>[]
): Promise<string | null> {
  try {
    if (!rows || rows.length === 0) return null;

    // 1. Aggregate x and y columns (group by X, sum Y)
    const groups = new Map<string, number>();

    for (const row of rows) {
      const keys = Object.keys(row);
      const xRaw = row[xColumn] !== undefined ? row[xColumn] : row[keys[0]];
      const yRaw = row[yColumn] !== undefined ? row[yColumn] : (row['value'] !== undefined ? row['value'] : row[keys[1]]);

      if (xRaw == null || yRaw == null) continue;

      let y = 0;
      if (typeof yRaw === 'number') {
        y = yRaw;
      } else {
        const clean = String(yRaw).replace(/,/g, '').trim();
        y = parseFloat(clean);
      }

      if (!Number.isFinite(y)) continue;
      const key = String(xRaw);
      groups.set(key, (groups.get(key) || 0) + y);
    }

    const entries = Array.from(groups.entries()).map(([x, y]) => ({ x, y }));

    if (entries.length === 0) return null;

    // 2. Sort by y descending, take top 5
    const topValues = [...entries]
      .sort((a, b) => b.y - a.y)
      .slice(0, 5);

    // 3. Format top values
    const formattedTopValues = topValues
      .map((v) => `${v.x}: ${v.y.toLocaleString('vi-VN')}`)
      .join(', ');

    // 4. Call LM Studio directly
    const systemPrompt = `Bạn là chuyên gia phân tích dữ liệu. Dựa vào dữ liệu biểu đồ, hãy viết đúng 2-3 câu nhận xét ngắn gọn bằng tiếng Việt. Tập trung vào: giá trị cao nhất/thấp nhất, xu hướng nổi bật. Chỉ trả về đúng các câu nhận xét, không giải thích thêm.`;

    const userMessage = `Biểu đồ: ${title}
Loại: ${chartType}
Top 5 giá trị: ${formattedTopValues}
Tổng số dòng dữ liệu: ${rows.length}`;

    const response = await fetch(`${LM_STUDIO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LM_STUDIO_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 150,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error(`Narrative helper LM Studio status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error('generateNarrative error:', err);
    return null;
  }
}
