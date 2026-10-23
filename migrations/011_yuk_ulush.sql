-- Yuk xati ulushi. Faqat yangi nullable ustun va yangi jadval.
-- Mavjud qatorlar o'zgarmaydi. UPDATE, DELETE va DROP yo'q.
-- products.price o'zgarmaydi. Waybill commission_amount o'zgarmaydi.

ALTER TABLE products ADD COLUMN IF NOT EXISTS yuk_unit_commission INTEGER;

CREATE TABLE IF NOT EXISTS yuk_commission_withdrawals (
  id                       BIGSERIAL PRIMARY KEY,
  amount                   INTEGER NOT NULL,
  note                     TEXT,
  taken_on                 DATE NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_telegram_id   TEXT,
  created_by_username      TEXT,
  created_by_first_name    TEXT,
  created_by_role          TEXT
);

CREATE INDEX IF NOT EXISTS idx_yuk_commission_withdrawals_taken
  ON yuk_commission_withdrawals (taken_on, id);
