# Implementation Plan — Multi-Agent Pipeline (Gemini → Qwen)

## Mục tiêu
Thay thế luồng Gemini-only trong `generate/route.ts` bằng kiến trúc 2 tầng:
- **Bước 1 — Gemini (Planner):** Nhận câu hỏi người dùng + schema → trả về danh sách bước xử lý kỹ thuật dạng pseudo-code
- **Bước 2 — Qwen Local (Coder):** Nhận pseudo-code từ Gemini → trả về Python Pandas code block sạch

---

## Scope
- [MODIFY] `src/app/api/notebook/generate/route.ts` — chỉ file này

---

## Chi tiết thay đổi

### Bước 1 — Gemini Planner Prompt

Thay system prompt Gemini hiện tại thành:
Bạn là Data Analysis Planner. Nhiệm vụ: Đọc câu hỏi người dùng và schema CSV,
trả về ĐÚNG định dạng sau — KHÔNG viết code, KHÔNG giải thích:

STEPS:

[Hành động pandas kỹ thuật, ví dụ: Filter df['Region'] == 'South']

[Hành động tiếp theo, ví dụ: groupby('Product Name')['Quantity'].sum()]

[Kết quả cuối: reset_index().rename(columns=...).to_dict(orient='records')]

Quy tắc bắt buộc:

Mỗi bước PHẢI dùng tên hàm Pandas thực (groupby, agg, sort_values, diff, shift...)

Bước cuối LUÔN kết thúc bằng .to_dict(orient='records') hoặc [{"result": value}] nếu scalar

Nếu có datetime: bước đầu PHẢI là pd.to_datetime(df[col], dayfirst=True, format='mixed')

Tối đa 6 bước

text

### Bước 2 — Parse Gemini output

Sau khi nhận response từ Gemini, extract phần STEPS:

```typescript
const stepsMatch = geminiResponse.match(/STEPS:\n([\s\S]+)/);
const steps = stepsMatch ? stepsMatch.trim() : geminiResponse.trim();
```

### Bước 3 — Qwen Coder Prompt

Gọi Qwen local endpoint với payload:

```typescript
const qwenSystemPrompt = `Bạn là lập trình viên Python Pandas chuyên nghiệp.
DataFrame df đã sẵn sàng với các cột: ${schema}.
Chỉ trả về code Python trong cặp thẻ \`\`\`python ... \`\`\`.
Không giải thích. Không import. Chỉ dùng biến df.
Biến kết quả cuối PHẢI là _result (list of dict hoặc scalar wrap).`;

const qwenUserPrompt = `Viết code Python thực thi chính xác các bước sau:\n${steps}`;
```

### Bước 4 — Parse Qwen output

```typescript
const codeMatch = qwenResponse.match(/```python\n([\s\S]*?)```/);
const finalCode = codeMatch ? codeMatch.trim() : qwenResponse.trim();
```

### Bước 5 — Cấu trúc GenerateRequestBody mới

```typescript
interface GenerateRequestBody {
  question: string;
  schema: string;
  previousContext?: { question: string; resultSummary: string };
  useQwen?: boolean; // true = dùng pipeline mới, false = Gemini-only (fallback)
}
```

Nếu `useQwen === false` hoặc Qwen endpoint không khả dụng → fallback về Gemini trực tiếp như hiện tại.

---

## Qwen Endpoint giả định

Agent cần hỏi dev về URL endpoint Qwen local đang chạy:
- Nếu dùng Ollama: `http://localhost:11434/api/chat`
- Nếu dùng LM Studio: `http://localhost:1234/v1/chat/completions`  
- Nếu dùng Colab ngrok: URL ngrok tunnel (cần truyền qua env var `QWEN_ENDPOINT`)

---

## Kiểm thử sau khi triển khai

```bash
npx tsc --noEmit   # 0 lỗi
```

Test thủ công 3 kịch bản demo:
1. Query đơn giản (groupby/agg) → Qwen sinh code đúng
2. Multi-step query → Gemini chia đúng bước → Qwen code đúng  
3. Datetime query (.diff/.shift) → bước 1 có to_datetime(dayfirst=True)

---

## Lưu ý quan trọng

- KHÔNG sửa `NotebookCell.tsx`, `NotebookPanel.tsx`, `pyodideRunner.ts`
- Nếu Qwen trả về code lỗi cú pháp sau 1 lần retry → tự động fallback Gemini-only
- `previousContext` (context chaining) vẫn hoạt động — truyền vào Gemini ở Bước 1