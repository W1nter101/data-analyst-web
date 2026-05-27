CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  row_count     INTEGER,
  col_count     INTEGER,
  file_size     INTEGER,
  created_at    INTEGER DEFAULT (unixepoch()),
  last_used_at  INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id    TEXT REFERENCES uploaded_files(id) ON DELETE SET NULL,
  title      TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content         TEXT NOT NULL,
  intent          TEXT,
  sql_query       TEXT,
  chart_config    TEXT,
  created_at      INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_files_user ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_user  ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_file  ON conversations(file_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv   ON messages(conversation_id);
