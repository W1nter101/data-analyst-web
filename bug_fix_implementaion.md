# Implementation Plan — Chart Pipeline: Gemini Planner + Phi-3 JSON Generator

## Strict Scope
> Chỉ chỉnh sửa đúng 1 file:
> - `src/lib/chatProcessor.ts`
>
> KHÔNG động vào: NotebookPanel, generate/route.ts, notebook/route.ts, hay bất kỳ file nào khác.

---

## Bối cảnh
Hiện tại `chatProcessor.ts` gọi thẳng LM Studio với model `phi-3-mini-4k-instruct`,
truyền vào schema đầy đủ + system prompt dài (~2336 tokens) → Phi-3 bị collapse,
sinh ra text rác thay vì JSON → UI báo lỗi "Không thể phân tích phản hồi từ AI".

## Giải pháp
Tách thành 2 bước (giống pipeline Notebook):
- Bước 1: Gemini nhận schema + câu hỏi → sinh 1 câu instruction ngắn (~50 tokens)
- Bước 2: Phi-3 nhận instruction ngắn → sinh chart config JSON (~30 tokens)

---

## Proposed Changes

### [MODIFY] src/lib/chatProcessor.ts

#### Bước 1 — Thêm hàm callGeminiPlanner
Thêm hàm nội bộ (không export) ngay trong file:

```typescript
async function callGeminiPlanner(schema: string, userQuery: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`
  
  const prompt = `You are a data visualization planner.
Given the CSV schema and user request, output ONE short instruction (max 20 words) 
for another model to generate a chart JSON config.
Format: "<chart_type> chart. X=<column>, Y=<aggregation>(<column>)[, color=<column>]"

Schema columns: ${schema}
User request: "${userQuery}"

Output the instruction only. No explanation.`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 60, temperature: 0.1 }
    })
  })
  const data = await res.json()
  return data.candidates?.?.content?.parts?.?.text?.trim() ?? ""
}
```

#### Bước 2 — Thêm hàm callPhi3JsonGenerator
```typescript
async function callPhi3JsonGenerator(instruction: string): Promise<string> {
  const endpoint = process.env.LM_STUDIO_BASE_URL ?? "http://localhost:1234/v1"
  const model = process.env.LM_STUDIO_MODEL ?? "phi-3-mini-4k-instruct"

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `Return ONLY a JSON object with these fields:
{"type": "bar"|"line"|"pie"|"area", "x": "<column>", "y": "<column>", 
 "aggregation": "sum"|"count"|"avg"|"max"|"min", "color_by": "<column>"|null}
No explanation. No markdown. JSON only.`
        },
        { role: "user", content: instruction }
      ],
      max_tokens: 150,
      temperature: 0.1,
      stream: false,
      response_format: { type: "json_object" }
    })
  })
  const data = await res.json()
  return data.choices?.?.message?.content?.trim() ?? ""
}
```

#### Bước 3 — Thay thế luồng gọi cũ
Tìm đoạn code hiện tại đang gọi LM Studio trực tiếp với schema đầy đủ.
Thay bằng:

```typescript
// Bước 1: Gemini sinh instruction ngắn
const schemaShort = schema.map((col: any) => col.column_name).join(", ")
const instruction = await callGeminiPlanner(schemaShort, userQuery)

if (!instruction) throw new Error("Gemini planner failed")

// Bước 2: Phi-3 sinh JSON từ instruction ngắn  
const jsonStr = await callPhi3JsonGenerator(instruction)

// Bước 3: Parse và validate như cũ
let config: ChartConfig
try {
  config = JSON.parse(jsonStr)
} catch {
  throw new Error("Phi-3 JSON parse failed: " + jsonStr)
}
```

#### Bước 4 — Fallback nếu Phi-3 vẫn fail
Wrap toàn bộ Bước 2+3 trong try/catch:

```typescript
let config: ChartConfig
try {
  const jsonStr = await callPhi3JsonGenerator(instruction)
  config = JSON.parse(jsonStr)
} catch {
  // Fallback: Gemini sinh JSON trực tiếp từ instruction
  const fallbackJson = await callGeminiDirectJson(instruction, schema)
  config = JSON.parse(fallbackJson)
}
```

Hàm fallback `callGeminiDirectJson` dùng `responseMimeType: "application/json"` 
để Gemini đảm bảo trả JSON hợp lệ 100%.

---

## Verification Plan

### Automated
```bash
npx tsc --noEmit
```

### Manual — test 5 câu theo thứ tự
1. "vẽ bar chart sales theo city" → phải ra `{"type":"bar","x":"City","y":"Sales",...}`
2. "biểu đồ line doanh thu theo tháng" → `{"type":"line","x":"Order Date",...}`
3. "pie chart tỉ lệ category" → `{"type":"pie","x":"Category",...}`
4. "so sánh profit theo region và segment" → có `color_by`
5. Câu hỏi không liên quan chart: "tổng sales bao nhiêu" → hệ thống không crash

### Kiểm tra log LM Studio
Sau fix, log phải hiện:
- Phi-3 nhận message user dài **dưới 100 tokens**
- `finish_reason: "stop"` thay vì `"length"`
- Không còn error `Invalid model identifier`

---

## Lưu ý cho Agent
- Đọc toàn bộ `chatProcessor.ts` trước khi sửa để hiểu đúng hàm/interface hiện có
- Giữ nguyên interface `ChartConfig` — không đổi kiểu dữ liệu trả về cho frontend
- `GEMINI_API_KEY` đã có sẵn trong `.env.local`, không cần thêm
- `LM_STUDIO_BASE_URL` và `LM_STUDIO_MODEL` đã có sẵn trong `.env.local`