# Implementation Plan: Key Influencers Feature

## Tổng quan

Tính năng **Key Influencers** cho phép user hỏi AI câu kiểu *"Yếu tố nào ảnh hưởng nhiều nhất đến Profit?"* và nhận lại một horizontal bar chart thể hiện mức độ ảnh hưởng (feature importance) của từng cột còn lại lên cột mục tiêu đó.

**Thư viện sử dụng:** `scikit-learn` (RandomForest) — không cần thêm dependency phức tạp, tính nhanh, kết quả tin cậy với dữ liệu dạng bảng thông thường.

**Độ phức tạp:** Thấp–Trung | **Estimate:** 1–2 ngày | **Files thay đổi:** 7 files (3 NEW, 4 MODIFY)

---

## !IMPORTANT — Quyết định Kiến trúc

### Python sidecar vs. thuần TypeScript?

Dự án hiện tại là **Next.js + better-sqlite3**, không có Python runtime. Có 2 hướng:

| Hướng | Ưu | Nhược |
|---|---|---|
| **Python script qua `child_process.spawn`** | Tận dụng scikit-learn đầy đủ, chuẩn production | Cần Python + scikit-learn cài sẵn trên server |
| **JS-only: simple correlation (Pearson)** | Zero dependency, deploy ngay | Kém chính xác với non-linear data |

**Quyết định: Dùng Python script** (`child_process.spawn` từ Next.js API route). Script Python nhận đường dẫn SQLite + tên cột target qua stdin/args, trả JSON về stdout. Điều này tách biệt hoàn toàn, không làm phức tạp Next.js build.

---

## !IMPORTANT — Intent Detection

Thêm intent mới `key_influencers` vào `SYSTEM_PROMPT` trong `chatProcessor.ts`. Tương tự pattern của intent `transform` và `visualize` đã có.

```
Intent key_influencers:
  Khi user muốn biết yếu tố/cột nào ảnh hưởng đến một cột số cụ thể.
  Trigger: "yếu tố nào ảnh hưởng", "cột nào tác động", "nguyên nhân", "key influencers", "quan trọng nhất đến"
  {
    "intent": "key_influencers",
    "targetColumn": "<tên cột số mà user muốn phân tích>"
  }
```

---

## Proposed Changes

### NEW — `src/lib/keyInfluencers.py`

Script Python độc lập. Nhận arguments: `--db-path`, `--target-col`, `--file-id`.

```python
import sys, json, argparse
import sqlite3
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import numpy as np

def run(db_path: str, target_col: str):
    conn = sqlite3.connect(db_path)
    df = pd.read_sql_query("SELECT * FROM data", conn)
    conn.close()

    if target_col not in df.columns:
        print(json.dumps({"error": f"Column '{target_col}' not found"}))
        sys.exit(1)

    # Drop rows where target is null
    df = df.dropna(subset=[target_col])

    # Encode categorical columns
    feature_cols = [c for c in df.columns if c != target_col]
    X = df[feature_cols].copy()
    for col in X.select_dtypes(include=['object']).columns:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
    X = X.fillna(0)

    y = df[target_col]

    # Detect regression vs classification
    is_numeric = pd.to_numeric(y, errors='coerce').notna().all()
    if is_numeric:
        y = pd.to_numeric(y)
        model = RandomForestRegressor(n_estimators=100, random_state=42)
    else:
        model = RandomForestClassifier(n_estimators=100, random_state=42)

    model.fit(X, y)
    importances = model.feature_importances_

    results = sorted(
        [{"column": col, "importance": round(float(imp), 4)}
         for col, imp in zip(feature_cols, importances)],
        key=lambda x: x["importance"], reverse=True
    )
    print(json.dumps({"results": results[:10]}))  # top 10

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", required=True)
    parser.add_argument("--target-col", required=True)
    args = parser.parse_args()
    run(args.db_path, args.target_col)
```

---

### NEW — `src/app/api/insights/key-influencers/route.ts`

API route mới. Validate session, resolve SQLite path, gọi Python script, trả kết quả.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { spawn } from 'child_process'
import path from 'path'
import Database from 'better-sqlite3'
import { appDbPath } from '@/lib/db'  // adjust to actual app.sqlite path helper

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fileId, targetColumn } = await req.json()
  if (!fileId || !targetColumn) {
    return NextResponse.json({ error: 'Missing fileId or targetColumn' }, { status: 400 })
  }

  // Validate file ownership (same pattern as /api/data route)
  const appDb = new Database(appDbPath, { readonly: true })
  const file = appDb.prepare(
    'SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?'
  ).get(fileId, session.user.id)
  appDb.close()

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const dbPath = path.join(process.cwd(), 'storage', session.user.id, `${fileId}.sqlite`)
  const scriptPath = path.join(process.cwd(), 'src', 'lib', 'keyInfluencers.py')

  return new Promise((resolve) => {
    const proc = spawn('python3', [
      scriptPath,
      '--db-path', dbPath,
      '--target-col', targetColumn,
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(NextResponse.json({ error: `Python error: ${stderr}` }, { status: 500 }))
        return
      }
      try {
        const result = JSON.parse(stdout)
        resolve(NextResponse.json(result))
      } catch {
        resolve(NextResponse.json({ error: 'Invalid Python output' }, { status: 500 }))
      }
    })
  })
}
```

---

### NEW — `src/components/chart/KeyInfluencersChart.tsx`

Component mới render horizontal bar chart. Dùng Recharts (đã có trong project) với design tokens hiện tại.

```tsx
'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'

interface InfluencerResult {
  column: string
  importance: number
}

interface Props {
  results: InfluencerResult[]
  targetColumn: string
}

export function KeyInfluencersChart({ results, targetColumn }: Props) {
  const COLORS = [
    'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
    'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)',
  ]

  const tooltipStyle = {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
  }

  // Convert to percentage for readability
  const total = results.reduce((s, r) => s + r.importance, 0)
  const data = results.map(r => ({
    column: r.column,
    value: total > 0 ? Math.round((r.importance / total) * 100) : 0,
    raw: r.importance,
  }))

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Key Influencers → <span className="text-[var(--color-text)]">{targetColumn}</span>
      </p>
      <div style={{ height: Math.max(200, data.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
            />
            <YAxis
              type="category"
              dataKey="column"
              width={120}
              tick={{ fontSize: 11, fill: 'var(--color-text)' }}
            />
            <Tooltip
              formatter={(v: number, _: string, props: any) =>
                [`${v}% (raw: ${props.payload?.raw?.toFixed(4)})`, 'Mức ảnh hưởng']
              }
              contentStyle={tooltipStyle}
              itemStyle={{ color: 'var(--color-text)' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-[var(--color-text-faint)]">
        Dựa trên Random Forest feature importance. Phần trăm = tỷ lệ đóng góp tương đối.
      </p>
    </div>
  )
}
```

---

### MODIFY — `src/lib/chatProcessor.ts`

**Bước 1:** Thêm intent `key_influencers` vào `SYSTEM_PROMPT`:

```
- intent: "key_influencers"
  Khi user muốn biết cột nào ảnh hưởng đến một cột số.
  Keywords: "yếu tố nào ảnh hưởng", "cột nào tác động", "nguyên nhân của",
             "key influencers", "quan trọng nhất đến", "tác động đến"
  Output JSON:
  {
    "intent": "key_influencers",
    "targetColumn": "<tên cột số từ schema>"
  }
```

**Bước 2:** Cập nhật `isValidResponse()`:

```typescript
// Thêm vào switch/if-else của isValidResponse
if (result.intent === 'key_influencers') {
  return typeof result.targetColumn === 'string' && result.targetColumn.length > 0
}
```

**Bước 3:** Cập nhật `processChat()` — trả về ngay, không chạy SQL:

```typescript
if (result.intent === 'key_influencers') {
  return {
    intent: 'key_influencers',
    targetColumn: result.targetColumn,
  }
}
```

---

### MODIFY — `src/components/dashboard/LeftPanel.tsx`

Thêm xử lý intent `key_influencers` trong `sendMessage()`, tương tự pattern xử lý `transform` intent:

```typescript
// Trong sendMessage(), sau phần xử lý intent 'visualize':
if (data.intent === 'key_influencers') {
  // Gọi API insights
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

  if (!insightRes.ok) {
    setMessages(prev => [...prev, {
      id: `err-${Date.now()}`,
      role: 'assistant',
      content: `Không thể tính Key Influencers cho cột "${data.targetColumn}".`,
      isError: true,
    }])
    return
  }

  const insightData = await insightRes.json()

  setMessages(prev => [...prev, {
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: `__KEY_INFLUENCERS__`,  // sentinel value
    isError: false,
    keyInfluencers: {
      results: insightData.results,
      targetColumn: data.targetColumn,
    },
  }])
  return
}
```

**Cập nhật `ChatMessage` interface** trong `LeftPanel.tsx`:

```typescript
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  chartType?: string
  keyInfluencers?: {          // NEW
    results: Array<{ column: string; importance: number }>
    targetColumn: string
  }
}
```

**Cập nhật render bubble** — thêm nhánh render cho `keyInfluencers`:

```tsx
{/* Trong phần render message bubble, sau ReactMarkdown */}
{msg.keyInfluencers && (
  <KeyInfluencersChart
    results={msg.keyInfluencers.results}
    targetColumn={msg.keyInfluencers.targetColumn}
  />
)}
```

---

### MODIFY — `src/components/dashboard/LeftPanel.tsx` — Suggested Prompts

Thêm suggested prompt khi schema có ít nhất 2 cột số:

```typescript
// Trong useMemo suggestedPrompts, thêm:
const numericCols = csv.schema.filter(c => c.type === 'number')
if (numericCols.length >= 2) {
  const targetCol = numericCols[numericCols.length - 1].name  // last numeric col
  prompts.push(`Yếu tố nào ảnh hưởng nhiều nhất đến ${targetCol}?`)
}
```

---

### MODIFY — `requirements.txt` (NEW nếu chưa có)

```
scikit-learn>=1.3.0
pandas>=2.0.0
numpy>=1.24.0
```

---

## Files Changed Summary

| # | File | Action | Ghi chú |
|---|---|---|---|
| 1 | `src/lib/keyInfluencers.py` | NEW | Python script tính feature importance |
| 2 | `src/app/api/insights/key-influencers/route.ts` | NEW | API route gọi Python |
| 3 | `src/components/chart/KeyInfluencersChart.tsx` | NEW | Recharts horizontal bar chart |
| 4 | `src/lib/chatProcessor.ts` | MODIFY | Thêm intent `key_influencers` vào SYSTEM_PROMPT + xử lý |
| 5 | `src/components/dashboard/LeftPanel.tsx` | MODIFY | Xử lý response + render chart trong bubble |
| 6 | `requirements.txt` | NEW/MODIFY | scikit-learn, pandas, numpy |

**Không thay đổi:** `ChartRenderer.tsx`, `appStore.ts`, `DataTable.tsx`, database schema — tính năng hoàn toàn độc lập.

---

## Verification Plan

### Setup

```bash
pip install scikit-learn pandas numpy
# Verify Python accessible
python3 -c "from sklearn.ensemble import RandomForestRegressor; print('OK')"
```

### Manual Test Cases

1. Upload CSV có nhiều cột số (vd: `sales.csv` với Revenue, Cost, Quantity, Discount, Profit).
2. Gõ trong chat: *"Yếu tố nào ảnh hưởng nhiều nhất đến Profit?"*
   - Kỳ vọng: AI nhận diện `intent: key_influencers`, `targetColumn: "Profit"`.
   - API `/api/insights/key-influencers` được gọi.
   - Chat bubble hiển thị horizontal bar chart, cột có importance cao nhất ở trên cùng.
3. Thử với cột target là text/category (classification mode).
4. Thử với cột target không tồn tại — kỳ vọng: error bubble rõ ràng.
5. Thử với file CSV có cột null — kỳ vọng: xử lý gracefully (fillna(0)).

### TypeScript Check

```bash
npx tsc --noEmit
npm run build
```

### Edge Cases cần kiểm tra

- Dataset chỉ có 1 cột → Python script trả error, UI hiển thị message hữu ích
- Target column là text với nhiều unique values → dùng Classification mode, vẫn chạy được
- Dataset > 100,000 rows → Random Forest vẫn xử lý được, tuy chậm hơn (~2-5 giây)

---

## Open Questions

> **Q1:** Python runtime có sẵn trong môi trường deploy chưa?
> Nếu deploy lên Vercel/serverless: cần dùng hướng khác (edge function không support `child_process`). Trong trường hợp đó, thay bằng **Pearson correlation** thuần TypeScript làm approximation (kém chính xác hơn nhưng zero-dependency).

> **Q2:** Có muốn persist kết quả Key Influencers vào dashboard như một widget riêng không?
> Hiện tại plan này chỉ hiển thị trong chat bubble. Nếu muốn kéo vào Board/dashboard grid, cần thêm widget type mới trong `appStore`.

