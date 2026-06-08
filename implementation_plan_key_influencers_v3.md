# Implementation Plan: Key Influencers (v3)

## Tổng quan

Tính năng **Key Influencers** cho phép user hỏi trong chat *"Yếu tố nào ảnh hưởng nhiều nhất đến Profit?"* và nhận lại horizontal bar chart thể hiện mức độ tương quan của từng cột với cột mục tiêu.

**Phương pháp:** Pearson correlation + Spearman rank correlation — thuần TypeScript, zero dependency mới, deploy được trên Vercel.

**Files thay đổi: 5 files (3 NEW, 2 MODIFY)**

---

## !IMPORTANT — Các vấn đề v2 đã được fix trong v3

| Vấn đề v2 | Giải pháp v3 |
|---|---|
| Tự viết `jwtVerify` thủ công, sai env var | Dùng `getSession(req)` từ `@/lib/session` |
| DB path manual `process.cwd() + 'app.sqlite'` | Dùng `appDb` singleton + `storage.getPath()` |
| `isValidResponse` validate column trong schema | Chỉ check structure; column existence validate trong API route bằng `PRAGMA table_info` |
| `processChat` không persist vào conversation history | Thêm `saveUserMessage` + `saveAssistantMessage` trước khi return |
| `KeyInfluencersChart` inline trong `LeftPanel.tsx` | Tách ra `src/components/chart/KeyInfluencersChart.tsx` |
| `fileDb` có thể leak khi throw | Dùng `try/finally` đảm bảo luôn `close()` |
| Score hiển thị `%` tương đối, gây hiểu nhầm | Hiển thị giá trị tuyệt đối `0.00–1.00` |

---

## Proposed Changes

---

### NEW — `src/lib/keyInfluencers.ts`

Thuật toán Pearson + Spearman thuần TypeScript, không dependency ngoài.

```typescript
export interface InfluencerResult {
  column: string
  pearson: number      // -1.00 đến 1.00
  spearman: number     // -1.00 đến 1.00
  score: number        // abs avg của pearson + spearman, 0.00–1.00
  direction: 'positive' | 'negative' | 'neutral'
}

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

function rankArray(arr: number[]): number[] {
  const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
  const ranks = new Array(arr.length)
  let j = 0
  while (j < sorted.length) {
    let k = j
    while (k + 1 < sorted.length && sorted[k + 1].v === sorted[j].v) k++
    const avgRank = (j + k) / 2 + 1 // 1-based average rank cho ties
    for (let m = j; m <= k; m++) ranks[sorted[m].i] = avgRank
    j = k + 1
  }
  return ranks
}

function spearmanCorrelation(x: number[], y: number[]): number {
  return pearsonCorrelation(rankArray(x), rankArray(y))
}

export function computeKeyInfluencers(
  rows: Record<string, string>[],
  targetColumn: string,
  allColumns: string[],
): InfluencerResult[] {
  // Parse target column — bỏ các row null/NaN
  const targetValues: number[] = []
  const validIndexes: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const num = parseFloat(String(rows[i][targetColumn] ?? '').replace(/,/g, ''))
    if (isFinite(num)) {
      targetValues.push(num)
      validIndexes.push(i)
    }
  }
  if (targetValues.length < 5) return []

  const results: InfluencerResult[] = []
  const featureCols = allColumns.filter(c => c !== targetColumn)

  for (const col of featureCols) {
    const rawVals = validIndexes.map(i => rows[i][col])
    const numericVals = rawVals.map(v => parseFloat(String(v ?? '').replace(/,/g, '')))
    let featureValues: number[]

    if (numericVals.every(isFinite)) {
      featureValues = numericVals
    } else {
      // Label encoding cho categorical
      const uniqueMap = new Map<string, number>()
      let idx = 0
      featureValues = rawVals.map(v => {
        const key = String(v ?? '')
        if (!uniqueMap.has(key)) uniqueMap.set(key, idx++)
        return uniqueMap.get(key)!
      })
      // Skip cột free-text (quá nhiều unique values)
      if (uniqueMap.size > targetValues.length * 0.8) continue
    }

    const pearson  = pearsonCorrelation(featureValues, targetValues)
    const spearman = spearmanCorrelation(featureValues, targetValues)
    const score    = (Math.abs(pearson) + Math.abs(spearman)) / 2
    if (score < 0.01) continue // bỏ qua cột không có tương quan đáng kể

    const avgSign = (pearson + spearman) / 2
    results.push({
      column: col,
      pearson,
      spearman,
      score,
      direction: avgSign > 0.05 ? 'positive' : avgSign < -0.05 ? 'negative' : 'neutral',
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10)
}
```

---

### NEW — `src/app/api/insights/key-influencers/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { getSession } from '@/lib/session'       // ✅ helper có sẵn — không tự verify JWT
import appDb from '@/lib/appDb'                  // ✅ singleton — KHÔNG gọi .close()
import storage from '@/lib/storage'              // ✅ getPath() helper cho file SQLite
import { computeKeyInfluencers } from '@/lib/keyInfluencers'

export async function POST(req: NextRequest) {
  // Auth — đúng pattern mọi API route trong project
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fileId, targetColumn } = await req.json()
  if (!fileId || !targetColumn) {
    return NextResponse.json({ error: 'Missing fileId or targetColumn' }, { status: 400 })
  }

  // Validate file ownership — dùng appDb singleton, KHÔNG close
  const file = appDb
    .prepare('SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?')
    .get(fileId, session.userId) as { id: string } | undefined

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Path file SQLite của user — dùng storage.getPath()
  const dbPath = storage.getPath(session.userId, fileId)
  const fileDb = new Database(dbPath, { readonly: true })

  try {
    // Validate targetColumn tồn tại — column existence check ở đây, không trong isValidResponse
    const tableInfo = fileDb.pragma('table_info(data)') as Array<{ name: string }>
    const allColumns = tableInfo.map(c => c.name)

    if (!allColumns.includes(targetColumn)) {
      return NextResponse.json(
        { error: `Cột "${targetColumn}" không tồn tại trong dữ liệu.` },
        { status: 400 },
      )
    }

    const rows = fileDb
      .prepare('SELECT * FROM data LIMIT 5000')
      .all() as Record<string, string>[]

    if (rows.length < 5) {
      return NextResponse.json(
        { error: 'Dữ liệu quá ít (< 5 hàng) để phân tích.' },
        { status: 400 },
      )
    }

    const results = computeKeyInfluencers(rows, targetColumn, allColumns)

    if (results.length === 0) {
      return NextResponse.json(
        { error: `Không tìm thấy tương quan đáng kể với cột "${targetColumn}".` },
        { status: 200 },
      )
    }

    return NextResponse.json({ results, rowCount: rows.length })

  } finally {
    fileDb.close() // ✅ try/finally — luôn close dù có throw hay return sớm
  }
}
```

---

### NEW — `src/components/chart/KeyInfluencersChart.tsx`

Tách ra file riêng — nhất quán với project structure (đã có `src/components/chart/`).
Score hiển thị giá trị tuyệt đối `0.00–1.00`, không dùng `%` tương đối.

```tsx
'use client'

export interface InfluencerResult {
  column: string
  pearson: number
  spearman: number
  score: number
  direction: 'positive' | 'negative' | 'neutral'
}

interface KeyInfluencersChartProps {
  results: InfluencerResult[]
  targetColumn: string
  rowCount: number
}

const DIRECTION_COLOR: Record<string, string> = {
  positive: 'var(--color-success)',
  negative: 'var(--color-error)',
  neutral:  'var(--color-text-faint)',
}

const DIRECTION_ARROW: Record<string, string> = {
  positive: '↑',
  negative: '↓',
  neutral:  '~',
}

export function KeyInfluencersChart({ results, targetColumn, rowCount }: KeyInfluencersChartProps) {
  const maxScore = results[0]?.score ?? 1

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Key Influencers →{' '}
        <span className="text-[var(--color-text)]">{targetColumn}</span>
      </p>

      {results.map((r) => {
        const barPct = Math.round((r.score / maxScore) * 100) // chỉ dùng cho độ rộng bar
        const color  = DIRECTION_COLOR[r.direction]
        const arrow  = DIRECTION_ARROW[r.direction]
        // Tooltip hiển thị giá trị thô để user hiểu sâu hơn
        const tooltip = `Pearson: ${r.pearson.toFixed(2)}, Spearman: ${r.spearman.toFixed(2)}`

        return (
          <div key={r.column} className="flex items-center gap-2" title={tooltip}>
            <span className="w-28 shrink-0 truncate text-right text-xs text-[var(--color-text)]">
              {r.column}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-offset)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${barPct}%`, backgroundColor: color }}
              />
            </div>
            {/* Hiển thị score tuyệt đối 0.00–1.00, không phải % */}
            <span className="w-14 shrink-0 text-right font-mono text-xs" style={{ color }}>
              {arrow} {r.score.toFixed(2)}
            </span>
          </div>
        )
      })}

      <p className="mt-1 text-[10px] text-[var(--color-text-faint)]">
        Score 0.00–1.00 · ↑ tỷ lệ thuận · ↓ tỷ lệ nghịch · hover để xem Pearson/Spearman
        · {rowCount.toLocaleString()} hàng được phân tích
      </p>
    </div>
  )
}
```

---

### MODIFY — `src/lib/chatProcessor.ts`

**Bước 1 — Thêm intent vào `SYSTEM_PROMPT`:**

```typescript
// Thêm vào SYSTEM_PROMPT, cùng block với các intent khác:
`- intent: "key_influencers"
  Khi user muốn biết cột nào / yếu tố nào ảnh hưởng đến một cột cụ thể.
  Keywords: "yếu tố nào ảnh hưởng", "cột nào tác động", "nguyên nhân của",
    "key influencers", "quan trọng nhất đến", "tác động đến", "ảnh hưởng đến"
  Output JSON:
  {
    "intent": "key_influencers",
    "targetColumn": "<tên chính xác của cột từ schema>"
  }
  QUAN TRỌNG: targetColumn phải là tên cột có trong schema được cung cấp.`
```

**Bước 2 — `isValidResponse()`: chỉ check structure, KHÔNG nhận schema làm param:**

```typescript
// Thêm vào isValidResponse():
if (obj.intent === 'key_influencers') {
  // ✅ Chỉ check structure — isValidResponse không có access tới schema
  // Việc validate column tồn tại được thực hiện trong API route qua PRAGMA table_info
  return typeof obj.targetColumn === 'string' && obj.targetColumn.length > 0
}
```

**Bước 3 — `processChat()`: persist vào conversation history rồi return sớm:**

```typescript
// Thêm sau block validate result, trước block analyze/visualize/transform:
if (result.intent === 'key_influencers') {
  // ✅ Persist vào conversation history — đồng nhất với visualize, analyze, transform
  if (conversationId) {
    saveUserMessage(conversationId, userQuery)
    saveAssistantMessage(
      conversationId,
      `Key Influencers: ${result.targetColumn}`,
      'key_influencers',
    )
  }
  return {
    intent: 'key_influencers',
    targetColumn: result.targetColumn,
  }
}
```

---

### MODIFY — `src/components/dashboard/LeftPanel.tsx`

**Bước 1 — Import:**

```typescript
import {
  KeyInfluencersChart,
  type InfluencerResult,
} from '@/components/chart/KeyInfluencersChart'
```

**Bước 2 — Cập nhật `ChatMessage` interface:**

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  chartType?: string
  influencerData?: {          // NEW — field riêng, không dùng sentinel string
    results: InfluencerResult[]
    targetColumn: string
    rowCount: number
  }
}
```

**Bước 3 — Xử lý intent `key_influencers` trong `sendMessage()`**, thêm sau block `visualize`:

```typescript
if (data.intent === 'key_influencers') {
  const accessToken = useAuthStore.getState().accessToken
  const insightRes = await fetch('/api/insights/key-influencers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ fileId: currentFileId, targetColumn: data.targetColumn }),
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

**Bước 4 — Render chart trong bubble**, thêm ngay sau `</ReactMarkdown>`:

```tsx
{msg.influencerData && (
  <KeyInfluencersChart
    results={msg.influencerData.results}
    targetColumn={msg.influencerData.targetColumn}
    rowCount={msg.influencerData.rowCount}
  />
)}
```

**Bước 5 — Suggested prompt** trong `useMemo suggestedPrompts`:

```typescript
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
| 1 | `src/lib/keyInfluencers.ts` | **NEW** | Thuật toán Pearson + Spearman, zero dependency |
| 2 | `src/app/api/insights/key-influencers/route.ts` | **NEW** | API route với đúng auth + DB pattern |
| 3 | `src/components/chart/KeyInfluencersChart.tsx` | **NEW** | Chart component tách file riêng |
| 4 | `src/lib/chatProcessor.ts` | **MODIFY** | Intent + isValidResponse + processChat + persist |
| 5 | `src/components/dashboard/LeftPanel.tsx` | **MODIFY** | Interface + handler + render chart |

Không thay đổi: `appStore.ts`, `DataTable.tsx`, `ChartRenderer.tsx`, database schema.

---

## Verification Plan

### TypeScript & Build

```bash
npx tsc --noEmit   # phải pass 0 errors
npm run build
```

### Manual Test Cases

| # | Test | Input | Kỳ vọng |
|---|---|---|---|
| 1 | Happy path | `"Yếu tố nào ảnh hưởng đến Profit?"` | Bubble hiển thị bar chart, score `0.00–1.00`, mũi tên ↑↓ |
| 2 | Persist history | Hỏi → reload page | Message vẫn còn trong conversation history |
| 3 | Cột không tồn tại | `"Ảnh hưởng đến Revenue999?"` | `isValidResponse` reject → intent `unknown` → bubble lỗi |
| 4 | Dataset toàn categorical | CSV không có cột số | API trả 200 + `error` message rõ ràng |
| 5 | Dataset quá nhỏ | CSV có 3 rows | API trả 400, bubble lỗi tiếng Việt |
| 6 | Tooltip | Hover lên bar | Hiện `Pearson: 0.82, Spearman: 0.79` |
| 7 | Suggested prompt | File có ≥ 2 cột số | Suggested prompt xuất hiện tự động |
