-- ============================================================
-- Yuk xati (Telegram mini-app /yuk).
-- ADD-ONLY. Qayta ishga tushirish xavfsiz.
-- Mavjud qatorlar o'chirilmaydi, ustunlar qayta nomlanmaydi.
-- Pul ustunlari o'zgartirilmaydi. Taqsimni alohida skript yozadi:
--   node scripts/backfill-waybill-allocations.js
-- Productionga bu fayl qo'lda qo'llanadi. Agent yozmaydi.
-- ============================================================

ALTER TABLE waybills ADD COLUMN IF NOT EXISTS sale_date DATE;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS request_id TEXT;

-- Sana bir marta to'ldiriladi. created_at keyin o'zgarsa sale_date qimirlamaydi.
UPDATE waybills
SET sale_date = (created_at AT TIME ZONE 'Asia/Tashkent')::date
WHERE sale_date IS NULL AND created_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_request_id
  ON waybills (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waybills_sale_date ON waybills (sale_date, id);
CREATE INDEX IF NOT EXISTS idx_waybills_due_open
  ON waybills (due_date, id)
  WHERE debt_amount > 0;

CREATE SEQUENCE IF NOT EXISTS waybill_code_seq;

DO $$
DECLARE
  m bigint;
  cur bigint;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO m FROM waybills;
  SELECT last_value INTO cur FROM waybill_code_seq;
  IF cur < m THEN
    PERFORM setval('waybill_code_seq', m, true);
  END IF;
END $$;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reverses_payment_id INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'collection';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_reverses_payment_id_fkey'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_reverses_payment_id_fkey
      FOREIGN KEY (reverses_payment_id) REFERENCES payments(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_request_id
  ON payments (request_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_reversal
  ON payments (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

-- To'lov → yuk xati → summa. Manba shu. waybills.paid_amount keshlanadi.
CREATE TABLE IF NOT EXISTS payment_allocations (
  id            BIGSERIAL PRIMARY KEY,
  payment_id    INTEGER NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  waybill_id    BIGINT NOT NULL REFERENCES waybills(id) ON DELETE RESTRICT,
  amount        BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_alloc_payment ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_pay_alloc_waybill ON payment_allocations (waybill_id);

-- Ortiqcha pul. Qator o'chirilmaydi; tuzatish manfiy qator.
CREATE TABLE IF NOT EXISTS store_credits (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount        BIGINT NOT NULL,
  payment_id    INTEGER REFERENCES payments(id) ON DELETE RESTRICT,
  waybill_id    BIGINT REFERENCES waybills(id) ON DELETE RESTRICT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_credits_customer ON store_credits (customer_id);
CREATE INDEX IF NOT EXISTS idx_store_credits_payment ON store_credits (payment_id);

INSERT INTO settings (key, value, description) VALUES
  ('company_name', '', 'Yuk xatidagi kompaniya nomi'),
  ('company_phone', '', 'Yuk xatidagi telefon. Bo''sh bo''lsa customer_phone'),
  ('company_card', '', 'Yuk xatidagi karta raqami'),
  ('company_card_holder', '', 'Karta egasi')
ON CONFLICT (key) DO NOTHING;
