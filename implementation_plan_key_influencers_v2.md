# Implementation Plan: Key Influencers (v2 — TypeScript-only)

## Tổng quan

Cho phép user hỏi *"Yếu tố nào ảnh hưởng nhiều nhất đến Profit?"* trong chat và nhận lại horizontal bar chart thể hiện mức độ tương quan của từng cột với cột mục tiêu.

**Thay đổi so với v1:**
- ❌ Bỏ Python + scikit-learn + `child_process.spawn` → không tương thích Vercel
- ✅ Thuần TypeScript: Pearson correlation + Spearman rank correlation tính ngay trong Next.js API route
- ✅ Auth đúng: custom JWT Bearer token (pattern từ `useAuthStore`)
- ✅ LLM đúng: LM Studio qua `/api/chat` → `chatProcessor.ts`
- ✅ Bỏ sentinel string `__KEY_INFLUENCERS__` → dùng field metadata riêng

**Files thay đổi: 4 files (2 NEW, 2 MODIFY)**

---

## !IMPORTANT — Phương pháp thống kê

### Pearson Correlation

Đo mức độ tương quan **tuyến tính** giữa cột X và cột target Y. Giá trị từ -1 đến +1:
- `+1`: hoàn toàn tỷ lệ thuận
- `-1`: hoàn toàn tỷ lệ nghịch
- `0`: không có tương quan tuyến tính

### Spearman Rank Correlation

Đo tương quan **thứ hạng** — bắt được monotone relationships phi tuyến (ví dụ: khi X tăng Y luôn tăng dù không theo đường thẳng). Robust hơn Pearson với outliers.

### Kết hợp hai chỉ số

Dùng `Math.abs((pearson + spearman) / 2)` làm **composite score** để rank. Hiển thị cả hai giá trị riêng trong tooltip để user hiểu sâu hơn.

> **Note về giới hạn:** Không bắt được interaction effects (ví dụ "Discount chỉ ảnh hưởng Profit khi Quantity > 100"). Với 80% dataset dạng bảng thông thường, kết quả vẫn rất hữu ích và đáng tin cậy.

---

## Proposed Changes

---

### NEW — `src/lib/keyInfluencers.ts`

Tính toán Pearson + Spearman thuần TypeScript. Không dependency ngoài.

```typescript
export interface InfluencerResult {
  column: string
  pearson: number      // -1 to 1
  spearman: number     // -1 to 1
  score: number        // abs avg, 0 to 1, dùng để sort
  direction: 'positive' | 'negative' | 'neutral'
}

/**
 * Pearson correlation giữa 2 mảng số
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0

  const meanX = x.reduce((a, b) => a + b, 0) / n
  const meanY = y.reduce((a, b) => a + b, 0) / n

  let num = 0, denomX = 0, denomY = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    num    += dx * dy
    denomX += dx * dx
    denomY += dy * dy
  }

  const denom = Math.sqrt(denomX * denomY)
  return denom === 0 ? 0 : num / denom
}

/**
 * Rank array (ties → average rank)
 */
function rankArray(arr: number[]): number[] {
  const sorted = arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v)

  const ranks = new Array(arr.length)
  let j = 0
  while (j < sorted.length) {
    let k = j
    // Find extent of ties
    while (k + 1 < sorted.length && sorted[k + 1].v === sorted[j].v) k++
    const avgRank = (j + k) / 2 + 1 // 1-based
    for (let m = j; m <= k; m++) {
      ranks[sorted[m].i] = avgRank
    }
    j = k + 1
  }
  return ranks
}

/**
 * Spearman correlation = Pearson applied to ranks
 */
function spearmanCorrelation(x: number[], y: number[]): number {
  return pearsonCorrelation(rankArray(x), rankArray(y))
}

/**
 * Tính Key Influencers cho targetColumn từ rows SQLite
 */
export function computeKeyInfluencers(
  rows: Record<string, string>[],
  targetColumn: string,
  allColumns: string[]
): InfluencerResult[] {
  // Parse target column thành số
  const targetValues: number[] = []
  const validIndexes: number[] = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i][targetColumn]
    const num = parseFloat(String(raw ?? '').replace(/,/g, ''))
    if (isFinite(num)) {
      targetValues.push(num)
      validIndexes.push(i)
    }
  }

  if (targetValues.length < 5) return [] // quá ít dữ liệu

  const results: InfluencerResult[] = []
  const featureColumns = allColumns.filter(c => c !== targetColumn)

  for (const col of featureColumns) {
    // Parse feature column
    const rawVals = validIndexes.map(i => rows[i][col])

    // Thử parse số
    const numericVals = rawVals.map(v => parseFloat(String(v ?? '').replace(/,/g, '')))
    const allNumeric = numericVals.every(isFinite)

    let featureValues: number[]

    if (allNumeric) {
      featureValues = numericVals
    } else {
      // Encode categorical → integer (label encoding đơn giản)
      const uniqueMap = new Map<string, number>()
      let idx = 0
      featureValues = rawVals.map(v => {
        const key = String(v ?? '')
        if (!uniqueMap.has(key)) uniqueMap.set(key, idx++)
        return uniqueMap.get(key)!
      })
      // Nếu quá nhiều unique values (free-text) → skip
      if (uniqueMap.size > targetValues.length * 0.8) continue
    }

    const pearson  = pearsonCorrelation(featureValues, targetValues)
    const spearman = spearmanCorrelation(featureValues, targetValues)
    const score    = (Math.abs(pearson) + Math.abs(spearman)) / 2

    // Bỏ qua cột không có tương quan đáng kể
    if (score < 0.01) continue

    const avgSign = (pearson + spearman) / 2
    const direction = avgSign > 0.05
      ? 'positive'
      : avgSign < -0.05
        ? 'negative'
        : 'neutral'

    results.push({ column: col, pearson, spearman, score, direction })
  }

  // Sort by composite score DESC, lấy top 10
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}
```

---

### NEW — `src/app/api/insights/key-influencers/route.ts`

API route thuần Next.js. Auth đúng pattern custom JWT từ codebase (`Authorization: Bearer <token>`).

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import Database from 'better-sqlite3'
import path from 'path'
import { computeKeyInfluencers } from '@/lib/keyInfluencers'

// Dùng cùng secret key với auth hiện tại của project
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'your-secret-key')

export async function POST(req: NextRequest) {
  // --- Auth: same pattern as /api/data route ---
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let userId: string
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    userId = payload.userId as string
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // --- Validate input ---
  const { fileId, targetColumn } = await req.json()
  if (!fileId || !targetColumn) {
    return NextResponse.json({ error: 'Missing fileId or targetColumn' }, { status: 400 })
  }

  // --- Validate file ownership (same as /api/data) ---
  const appDb = new Database(
    path.join(process.cwd(), 'app.sqlite'),
    { readonly: true }
  )
  const file = appDb.prepare(
    'SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?'
  ).get(fileId, userId) as { id: string } | undefined
  appDb.close()

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // --- Load data from file's SQLite ---
  const fileDbPath = path.join(process.cwd(), 'storage', userId, `${fileId}.sqlite`)
  const fileDb = new Database(fileDbPath, { readonly: true })

  // Validate targetColumn tồn tại
  const tableInfo = fileDb.pragma(`table_info(data)`) as Array<{ name: string }>
  const allColumns = tableInfo.map(c => c.name)

  if (!allColumns.includes(targetColumn)) {
    fileDb.close()
    return NextResponse.json(
      { error: `Cột "${targetColumn}" không tồn tại trong dữ liệu.` },
      { status: 400 }
    )
  }

  // Lấy tối đa 5000 rows để tránh quá tải memory
  const rows = fileDb.prepare('SELECT * FROM data LIMIT 5000').all() as Record<string, string>[]
  fileDb.close()

  if (rows.length < 5) {
    return NextResponse.json(
      { error: 'Dữ liệu quá ít (< 5 hàng) để phân tích.' },
      { status: 400 }
    )
  }

  // --- Compute ---
  const results = computeKeyInfluencers(rows, targetColumn, allColumns)

  if (results.length === 0) {
    return NextResponse.json(
      { error: `Không tìm thấy tương quan đáng kể với cột "${targetColumn}".` },
      { status: 200 } // Không phải lỗi, chỉ không có kết quả
    )
  }

  return NextResponse.json({ results, rowCount: rows.length })
}
```

---

### MODIFY — `src/lib/chatProcessor.ts`

**Bước 1 — Thêm intent `key_influencers` vào `SYSTEM_PROMPT`:**

```typescript
// Thêm vào khối SYSTEM_PROMPT, cùng chỗ với các intent khác:
`- intent: "key_influencers"
  Khi user muốn biết cột nào/yếu tố nào ảnh hưởng đến một cột số cụ thể.
  Keywords tiếng Việt: "yếu tố nào ảnh hưởng", "cột nào tác động", "nguyên nhân của",
    "key influencers", "quan trọng nhất đến", "tác động đến", "ảnh hưởng đến"
  Output JSON:
  {
    "intent": "key_influencers",
    "targetColumn": "<tên chính xác của cột số từ schema>"
  }
  QUAN TRỌNG: targetColumn phải là tên cột số (datatype: number) có trong schema.`
```

**Bước 2 — Cập nhật `isValidResponse()`:**

```typescript
// Trong isValidResponse(), thêm case:
if (result.intent === 'key_influencers') {
  // Validate targetColumn có trong schema
  const validColumns = schema.map((c: { columnname: string }) => c.columnname)
  return typeof result.targetColumn === 'string'
    && result.targetColumn.length > 0
    && validColumns.includes(result.targetColumn)
}
```

**Bước 3 — Cập nhật `processChat()`, trả về sớm (không chạy SQL):**

```typescript
// Sau block validate, thêm:
if (result.intent === 'key_influencers') {
  return {
    intent: 'key_influencers',
    targetColumn: result.targetColumn,
  }
}
```

---

### MODIFY — `src/components/dashboard/LeftPanel.tsx`

**Bước 1 — Cập nhật `ChatMessage` interface** (thêm field `influencerData`):

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  chartType?: string
  influencerData?: {                    // NEW — thay thế sentinel string
    results: Array<{
      column: string
      pearson: number
      spearman: number
      score: number
      direction: 'positive' | 'negative' | 'neutral'
    }>
    targetColumn: string
    rowCount: number
  }
}
```

**Bước 2 — Xử lý `key_influencers` trong `sendMessage()`**, thêm sau block xử lý `visualize`:

```typescript
// Thêm vào sendMessage(), sau block "Apply chart config":
if (data.intent === 'key_influencers') {
  const accessToken = useAuthStore.getState().accessToken
  const insightRes = await fetch('/api/insights/key-influencers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      fileId: currentFileId,
      targetColumn: data.targetColumn,
    }),
  })

  const insightData = await insightRes.json()

  if (!insightRes.ok || insightData.error || !insightData.results) {
    setMessages(prev => [...prev, {
      id: `err-${Date.now()}`,
      role: 'assistant',
      content: insightData.error ?? `Không thể phân tích cột "${data.targetColumn}".`,
      isError: true,
    }])
    return
  }

  setMessages(prev => [...prev, {
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: `Đã phân tích ${insightData.rowCount.toLocaleString()} hàng dữ liệu.`,
    isError: false,
    influencerData: {
      results: insightData.results,
      targetColumn: data.targetColumn,
      rowCount: insightData.rowCount,
    },
  }])
  return
}
```

**Bước 3 — Render chart trong bubble**. Thêm inline component `KeyInfluencersChart` trực tiếp trong `LeftPanel.tsx` (tránh import thêm file, giữ gọn):

```tsx
// Thêm component ngay trên hàm LeftPanel:
function KeyInfluencersChart({
  results, targetColumn
}: {
  results: ChatMessage['influencerData']['results']
  targetColumn: string
}) {
  const DIRECTION_COLORS: Record<string, string> = {
    positive: 'var(--color-success)',
    negative: 'var(--color-error)',
    neutral:  'var(--color-text-faint)',
  }
  const maxScore = results[0]?.score ?? 1

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Key Influencers →{' '}
        <span className="text-[var(--color-text)]">{targetColumn}</span>
      </p>
      {results.map((r) => {
        const pct = Math.round((r.score / maxScore) * 100)
        const color = DIRECTION_COLORS[r.direction]
        const arrow = r.direction === 'positive' ? '↑' : r.direction === 'negative' ? '↓' : '~'
        const label = `Pearson: ${r.pearson.toFixed(2)}, Spearman: ${r.spearman.toFixed(2)}`
        return (
          <div key={r.column} className="group flex items-center gap-2" title={label}>
            <span className="w-28 shrink-0 truncate text-right text-xs text-[var(--color-text)]">
              {r.column}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-offset)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-8 shrink-0 text-xs font-mono" style={{ color }}>
              {arrow} {pct}%
            </span>
          </div>
        )
      })}
      <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
        ↑ tỷ lệ thuận · ↓ tỷ lệ nghịch · % = mức tương quan tương đối
      </p>
    </div>
  )
}
```

**Bước 4 — Gọi component trong render message bubble**, thêm ngay sau `</ReactMarkdown>`:

```tsx
{msg.influencerData && (
  <KeyInfluencersChart
    results={msg.influencerData.results}
    targetColumn={msg.influencerData.targetColumn}
  />
)}
```

**Bước 5 — Thêm suggested prompt**, trong `useMemo suggestedPrompts`:

```typescript
// Thêm vào suggestedPrompts:
const numericCols = csv.schema.filter(c => c.type === 'number')
if (numericCols.length >= 2) {
  const lastNumeric = numericCols[numericCols.length - 1].name
  prompts.push(`Yếu tố nào ảnh hưởng nhiều nhất đến ${lastNumeric}?`)
}
```

---

## Files Changed Summary

| # | File | Action | Ghi chú |
|---|---|---|---|
| 1 | `src/lib/keyInfluencers.ts` | **NEW** | Pearson + Spearman thuần TS, zero dependency |
| 2 | `src/app/api/insights/key-influencers/route.ts` | **NEW** | API route, auth JWT đúng pattern |
| 3 | `src/lib/chatProcessor.ts` | **MODIFY** | Thêm intent + isValidResponse + processChat |
| 4 | `src/components/dashboard/LeftPanel.tsx` | **MODIFY** | Interface + handler + render chart |

**Không thay đổi:** `ChartRenderer.tsx`, `appStore.ts`, `DataTable.tsx`, database schema, `requirements.txt`.

---

## Các vấn đề trong v1 đã được fix

| Vấn đề từ review | Trạng thái | Giải pháp |
|---|---|---|
| Python + `child_process` không chạy Vercel | ✅ Fixed | Thuần TypeScript, không spawn process |
| Auth dùng `next-auth` / `getServerSession` | ✅ Fixed | Custom JWT `jwtVerify` từ `jose`, Bearer token |
| Assume LLM là Gemini | ✅ Fixed | Tích hợp đúng vào `chatProcessor.ts` → LM Studio |
| Sentinel string `__KEY_INFLUENCERS__` | ✅ Fixed | Field riêng `influencerData` trong `ChatMessage` |
| Inline styles trong chart component | ✅ Fixed | Chỉ dùng Tailwind + CSS variables, inline chỉ cho dynamic color/width |
| `SELECT * FROM data` không giới hạn | ✅ Fixed | `LIMIT 5000` |
| Không timeout Python | ✅ N/A | Không còn Python process |
| `targetColumn` không validate trong schema | ✅ Fixed | Validate trong `isValidResponse()` và `PRAGMA table_info` |

---

## Verification Plan

### TypeScript check
```bash
npx tsc --noEmit
npm run build
```

### Manual test cases

1. **Happy path:** Upload `sales.csv` với Revenue, Cost, Quantity, Discount, Profit.
   - Gõ: *"Yếu tố nào ảnh hưởng nhiều nhất đến Profit?"*
   - Kỳ vọng: bubble hiển thị bar chart, Revenue/Cost đứng đầu, có mũi tên ↑/↓.

2. **Suggested prompt:** Khi file có ≥ 2 cột số, suggested prompt hiển thị "Yếu tố nào ảnh hưởng nhiều nhất đến [cột cuối]?"

3. **Cột target không tồn tại:** *"Ảnh hưởng đến Revenue123?"*
   - `isValidResponse()` reject → LM Studio trả `intent: unknown` → bubble lỗi.

4. **Dataset toàn categorical:** CSV không có cột số → không có suggested prompt, nếu hỏi → trả lỗi hữu ích.

5. **Dataset nhỏ (< 5 rows):** API trả 400 → bubble lỗi với message rõ ràng.

6. **Tooltip hover:** Di chuột lên bar → hiện `Pearson: 0.82, Spearman: 0.79`.

---

## Open Questions

> **Q1 (nhỏ):** Tên cột trong `PRAGMA table_info` có case-sensitive không trong SQLite?
> → Không, SQLite column names case-insensitive khi query nhưng `table_info` trả đúng case gốc. Plan đã dùng exact match — nên đảm bảo AI trả về `targetColumn` khớp chính xác với tên trong schema (đã có trong SYSTEM_PROMPT: *"tên chính xác"*).

> **Q2 (optional):** Có muốn persist kết quả vào conversation history (DB) không?
> Hiện tại `influencerData` chỉ trong React state → refresh mất. Nếu cần, thêm field `influencer_data` vào bảng messages trong DB.

