-- 014: qarz eslatmasi va "To'ladim" so'rovlari.
-- Qayta ishga tushsa xavfsiz. Mavjud qatorlar o'chirilmaydi.
-- Productionga qo'lda. Server ishga tushganda yozilmaydi.

CREATE TABLE IF NOT EXISTS debt_reminders (
  id                   BIGSERIAL PRIMARY KEY,
  waybill_id           BIGINT NOT NULL REFERENCES waybills(id),
  customer_id          INTEGER NOT NULL REFERENCES customers(id),
  sent_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind                 TEXT NOT NULL CHECK (kind IN ('due', 'repeat')),
  telegram_message_id  BIGINT,
  status               TEXT NOT NULL DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_debt_reminders_waybill
  ON debt_reminders (waybill_id, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_reminders_waybill_day
  ON debt_reminders (waybill_id, ((sent_at AT TIME ZONE 'Asia/Tashkent')::date));

CREATE TABLE IF NOT EXISTS payment_claims (
  id           BIGSERIAL PRIMARY KEY,
  waybill_id   BIGINT NOT NULL REFERENCES waybills(id),
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  amount       BIGINT NOT NULL CHECK (amount > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by   TEXT,
  decided_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_claims_status
  ON payment_claims (status, id DESC);

INSERT INTO settings (key, value, description) VALUES
  ('reminders_enabled', 'false', 'Qarz eslatmasi. Sukut o''chiq'),
  ('reminder_repeat_days', '3', 'Keyingi eslatmagacha kun'),
  ('admin_chat_id', '', 'Eslatma nusxasi va tasdiq chati')
ON CONFLICT (key) DO NOTHING;
