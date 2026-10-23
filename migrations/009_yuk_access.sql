-- ============================================================
-- Yuk xati kirish so'rovi. ADD-ONLY.
-- Faqat yangi jadvallar. Mavjud qatorlar o'zgarmaydi.
-- Eski bot yozuvlariga tegilmaydi.
-- Productionga bu fayl qo'lda qo'llanadi. Agent yozmaydi.
-- ============================================================

CREATE TABLE IF NOT EXISTS yuk_access_requests (
  telegram_id         TEXT PRIMARY KEY,
  first_name          TEXT,
  last_name           TEXT,
  username            TEXT,
  full_name           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  bot_env             TEXT,
  notify_message_id   TEXT,
  notify_refs         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at         TIMESTAMPTZ,
  decided_at          TIMESTAMPTZ,
  decided_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_yuk_access_requests_status
  ON yuk_access_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS yuk_allowed_users (
  telegram_id    TEXT PRIMARY KEY,
  first_name     TEXT,
  last_name      TEXT,
  username       TEXT,
  full_name      TEXT,
  approved_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by    TEXT
);
