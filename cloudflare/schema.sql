-- Skema Dompet untuk D1 (SQLite terdistribusi Cloudflare).
-- Kontrak sama dengan server/serve_all.py.

-- Record sync per ruang. LWW berdasarkan kolom `updated` (epoch ms).
CREATE TABLE IF NOT EXISTS records (
  room    TEXT    NOT NULL,
  rid     TEXT    NOT NULL,
  updated REAL    NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  body    TEXT,
  PRIMARY KEY (room, rid)
);

-- Query utama selalu: WHERE room = ? AND updated > ? ORDER BY updated ASC
CREATE INDEX IF NOT EXISTS idx_records_room_updated
  ON records (room, updated);

-- Ruang = satu keluarga. Kunci disimpan sebagai SHA-256 hex, bukan teks asli.
CREATE TABLE IF NOT EXISTS rooms (
  room     TEXT PRIMARY KEY,
  created  REAL NOT NULL,
  key_hash TEXT
);
