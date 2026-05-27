# Implementation Plan — File Persistence & Chat History

Tích hợp lưu file per-user (SQLite trên server) và lịch sử chat vào CSV Analyst.
Không thay đổi logic hiện có — chỉ thêm lớp persistence phía dưới.

---

## Tổng quan kiến trúc

```
User
 ├── uploads CSV  → convert → lưu {userId}/{fileId}.sqlite trên server
 ├── chat với AI  → mỗi message lưu vào DB chính
 └── quay lại     → load danh sách files + conversations cũ
```

**Database chính** (PostgreSQL hoặc SQLite app riêng): lưu metadata — users, files, conversations, messages.
**File storage** (`/storage/` trên server): lưu file `.sqlite` data thực của từng user.

---

## Database Schema

### Tạo file migration: `src/db/migrations/001_persistence.sql`

```sql
-- Files của từng user
CREATE TABLE IF NOT EXISTS user_files (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id       TEXT NOT NULL,
  original_name TEXT NOT NULL,          -- tên file gốc user upload: "sales_2024.csv"
  storage_path  TEXT NOT NULL,          -- "./storage/{userId}/{fileId}.sqlite"
  row_count     INTEGER DEFAULT 0,
  size_bytes    INTEGER DEFAULT 0,
  columns       TEXT NOT NULL,          -- JSON array: ["Country","Revenue","Cost"]
  column_types  TEXT NOT NULL,          -- JSON object: {"Revenue":"number","Country":"string"}
  created_at    DATETIME DEFAULT (datetime('now')),
  last_accessed DATETIME DEFAULT (datetime('now'))
);

-- Conversations (mỗi session chat gắn với 1 file)
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL,
  file_id     TEXT REFERENCES user_files(id) ON DELETE CASCADE,
  title       TEXT,                     -- tự generate từ tin nhắn đầu tiên
  created_at  DATETIME DEFAULT (datetime('now')),
  updated_at  DATETIME DEFAULT (datetime('now'))
);

-- Tin nhắn trong conversation
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content         TEXT NOT NULL,        -- text hiển thị
  intent          TEXT,                 -- 'visualize' | 'analyze' | 'add_column' | 'unknown'
  sql_executed    TEXT,                 -- câu SQL đã chạy (KHÔNG lưu kết quả)
  chart_config    TEXT,                 -- JSON chart config nếu intent=visualize
  created_at      DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_files_user_id ON user_files(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
```

---

## Phase 1 — File Persistence

### [NEW] `src/lib/storage.ts`

Abstraction layer — hiện tại dùng local filesystem, sau migrate MinIO không đổi code.

```typescript
import fs from 'fs/promises'
import path from 'path'

const STORAGE_ROOT = process.env.STORAGE_PATH ?? './storage'

export const storage = {
  async save(userId: string, fileId: string, data: Buffer): Promise<string> {
    const dir = path.join(STORAGE_ROOT, userId)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${fileId}.sqlite`)
    await fs.writeFile(filePath, data)
    return filePath
  },

  async getPath(userId: string, fileId: string): Promise<string> {
    return path.join(STORAGE_ROOT, userId, `${fileId}.sqlite`)
  },

  async delete(userId: string, fileId: string): Promise<void> {
    const filePath = path.join(STORAGE_ROOT, userId, `${fileId}.sqlite`)
    await fs.unlink(filePath).catch(() => {}) // ignore nếu không tồn tại
  },

  async exists(userId: string, fileId: string): Promise<boolean> {
    const filePath = path.join(STORAGE_ROOT, userId, `${fileId}.sqlite`)
    return fs.access(filePath).then(() => true).catch(() => false)
  }
}
```

### [MODIFY] Upload API — `src/app/api/upload/route.ts`

Sau khi convert CSV → SQLite (logic hiện có), thêm:

```typescript
import { storage } from '@/lib/storage'
import { db } from '@/lib/db'  // DB chính

// Sau khi tạo xong in-memory SQLite:
const fileBuffer = Buffer.from(sqliteDb.export())  // better-sqlite3
const fileId = crypto.randomUUID()
const storagePath = await storage.save(userId, fileId, fileBuffer)

// Lưu metadata
await db.run(`
  INSERT INTO user_files (id, user_id, original_name, storage_path, row_count, size_bytes, columns, column_types)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, [fileId, userId, originalFileName, storagePath, rowCount, fileBuffer.length,
    JSON.stringify(columns), JSON.stringify(columnTypes)])

return Response.json({ fileId, fileName: originalFileName, columns })
```

### [NEW] `src/app/api/files/route.ts` — list files của user

```typescript
// GET /api/files
export async function GET() {
  const { userId } = await getSession()
  const files = await db.all(
    `SELECT id, original_name, row_count, size_bytes, columns, created_at, last_accessed
     FROM user_files WHERE user_id = ? ORDER BY last_accessed DESC`,
    [userId]
  )
  return Response.json(files.map(f => ({
    ...f,
    columns: JSON.parse(f.columns)
  })))
}

// DELETE /api/files?fileId=xxx
export async function DELETE(req: Request) {
  const { userId } = await getSession()
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')

  // Verify ownership
  const file = await db.get(
    `SELECT id FROM user_files WHERE id = ? AND user_id = ?`,
    [fileId, userId]
  )
  if (!file) return new Response('Not found', { status: 404 })

  await storage.delete(userId, fileId)
  await db.run(`DELETE FROM user_files WHERE id = ?`, [fileId])
  // Cascade xóa conversations + messages liên quan
  return Response.json({ success: true })
}
```

### [MODIFY] Data query API — `src/app/api/data/route.ts`

Thay vì dùng in-memory SQLite (mất khi server restart), load từ file:

```typescript
import Database from 'better-sqlite3'
import { storage } from '@/lib/storage'

export async function GET(req: Request) {
  const { userId } = await getSession()
  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')

  // Verify ownership + lấy path
  const file = await db.get(
    `SELECT storage_path FROM user_files WHERE id = ? AND user_id = ?`,
    [fileId, userId]
  )
  if (!file) return new Response('Forbidden', { status: 403 })

  // Update last_accessed
  await db.run(`UPDATE user_files SET last_accessed = datetime('now') WHERE id = ?`, [fileId])

  // Mở SQLite file của user
  const userDb = new Database(file.storage_path, { readonly: true })
  const rows = userDb.prepare('SELECT rowid AS __rowid, * FROM "data" LIMIT 100').all()
  userDb.close()

  return Response.json(rows)
}
```

---

## Phase 2 — Chat History

### [NEW] `src/app/api/conversations/route.ts`

```typescript
// GET /api/conversations — list conversations (kèm tên file)
export async function GET() {
  const { userId } = await getSession()
  const conversations = await db.all(`
    SELECT c.id, c.title, c.created_at, c.updated_at,
           f.original_name AS file_name, f.id AS file_id
    FROM conversations c
    LEFT JOIN user_files f ON c.file_id = f.id
    WHERE c.user_id = ?
    ORDER BY c.updated_at DESC
    LIMIT 50
  `, [userId])
  return Response.json(conversations)
}

// POST /api/conversations — tạo conversation mới
export async function POST(req: Request) {
  const { userId } = await getSession()
  const { fileId } = await req.json()

  const id = crypto.randomUUID()
  await db.run(
    `INSERT INTO conversations (id, user_id, file_id) VALUES (?, ?, ?)`,
    [id, userId, fileId]
  )
  return Response.json({ id })
}
```

### [NEW] `src/app/api/conversations/[id]/messages/route.ts`

```typescript
// GET — load messages của 1 conversation (phân trang)
export async function GET(req, { params }) {
  const { userId } = await getSession()
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? 50)
  const before = searchParams.get('before')  // cursor pagination

  // Verify ownership
  const conv = await db.get(
    `SELECT id FROM conversations WHERE id = ? AND user_id = ?`,
    [params.id, userId]
  )
  if (!conv) return new Response('Forbidden', { status: 403 })

  const messages = await db.all(`
    SELECT id, role, content, intent, chart_config, created_at
    FROM messages
    WHERE conversation_id = ?
    ${before ? 'AND created_at < ?' : ''}
    ORDER BY created_at ASC
    LIMIT ?
  `, before ? [params.id, before, limit] : [params.id, limit])

  return Response.json(messages.map(m => ({
    ...m,
    chart_config: m.chart_config ? JSON.parse(m.chart_config) : null
  })))
}

// POST — lưu 1 message
export async function POST(req, { params }) {
  const { userId } = await getSession()
  const { role, content, intent, sql_executed, chart_config } = await req.json()

  // Verify ownership
  const conv = await db.get(
    `SELECT id FROM conversations WHERE id = ? AND user_id = ?`,
    [params.id, userId]
  )
  if (!conv) return new Response('Forbidden', { status: 403 })

  const id = crypto.randomUUID()
  await db.run(`
    INSERT INTO messages (id, conversation_id, role, content, intent, sql_executed, chart_config)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [id, params.id, role, content, intent ?? null,
      sql_executed ?? null,
      chart_config ? JSON.stringify(chart_config) : null])

  // Update conversation.updated_at + tự set title từ tin nhắn đầu tiên
  await db.run(
    `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
    [params.id]
  )

  // Auto-title: lấy 6 từ đầu của user message đầu tiên
  const msgCount = await db.get(
    `SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?`, [params.id]
  )
  if (msgCount.cnt === 1 && role === 'user') {
    const title = content.split(' ').slice(0, 6).join(' ')
    await db.run(`UPDATE conversations SET title = ? WHERE id = ?`, [title, params.id])
  }

  return Response.json({ id })
}
```

---

## Phase 3 — Frontend Integration

### [MODIFY] `src/store/appStore.ts`

Thêm vào Zustand store:

```typescript
// Thêm state
currentFileId: string | null
currentConversationId: string | null
userFiles: FileMetadata[]

// Thêm actions
setCurrentFile: (fileId: string) => void
loadUserFiles: () => Promise<void>
createConversation: (fileId: string) => Promise<string>
saveMessage: (role: string, content: string, extras?: MessageExtras) => Promise<void>
```

### [MODIFY] `src/components/dashboard/LeftPanel.tsx`

Sau khi AI trả lời, tự động lưu cả 2 messages (user + assistant):

```typescript
// Sau khi gửi message và nhận response:
await saveMessage('user', userInput)
await saveMessage('assistant', aiResponse, {
  intent: result.intent,
  sql_executed: result.sql,
  chart_config: result.chart_config
})
```

### [NEW] `src/components/dashboard/FileSelector.tsx`

Dropdown/list hiển thị files cũ của user, cho phép switch giữa các files.

---

## Phase 4 — Cleanup & Security

### Tự động dọn file cũ (optional)

```typescript
// Chạy daily bằng cron job hoặc Next.js route handler
// Xóa files không được access trong 30 ngày
await db.run(`
  DELETE FROM user_files
  WHERE last_accessed < datetime('now', '-30 days')
`)
// Kèm xóa file vật lý trên disk
```

### Thêm vào `.gitignore`

```
/storage/
*.sqlite
!src/db/*.sqlite
```

### Env variables cần thêm

```env
STORAGE_PATH=./storage          # đường dẫn lưu file
DB_PATH=./app.sqlite            # DB chính (nếu dùng SQLite)
MAX_FILE_SIZE_MB=50             # giới hạn upload
MAX_FILES_PER_USER=10           # giới hạn số file mỗi user
```

---

## Files Changed Summary

| # | File | Action | Phase |
|---|------|--------|-------|
| 1 | `src/lib/storage.ts` | NEW | 1 |
| 2 | `src/app/api/upload/route.ts` | MODIFY | 1 |
| 3 | `src/app/api/files/route.ts` | NEW | 1 |
| 4 | `src/app/api/data/route.ts` | MODIFY | 1 |
| 5 | `src/app/api/conversations/route.ts` | NEW | 2 |
| 6 | `src/app/api/conversations/[id]/messages/route.ts` | NEW | 2 |
| 7 | `src/db/migrations/001_persistence.sql` | NEW | — |
| 8 | `src/store/appStore.ts` | MODIFY | 3 |
| 9 | `src/components/dashboard/LeftPanel.tsx` | MODIFY | 3 |
| 10 | `src/components/dashboard/FileSelector.tsx` | NEW | 3 |

**Tổng: 10 files** — 6 files mới, 4 files modify.

---

## Verification Plan

```bash
# TypeScript
npx tsc --noEmit

# Test thủ công
# 1. Upload CSV → kiểm tra file xuất hiện trong /storage/{userId}/
# 2. Refresh trang → file vẫn còn trong danh sách
# 3. Chat → kiểm tra messages lưu vào DB
# 4. Mở tab mới → load lại conversation cũ đúng nội dung
# 5. Delete file → kiểm tra file vật lý bị xóa + conversations xóa cascade
# 6. User B không đọc được file của User A (403)
```
