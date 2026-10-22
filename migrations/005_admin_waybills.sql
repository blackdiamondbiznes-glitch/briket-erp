-- ============================================================
-- Admin yozadigan yuk xati (Yuk tarqatish).
-- Buyurtma (orders) yaratilmaydi. stock_posted = true bo'lgan
-- yuk xati tayyor mahsulot qoldig'idan bir marta ayiriladi.
-- Qayta ishga tushirish xavfsiz. Mavjud qatorlar o'chirilmaydi,
-- ustunlar qayta nomlanmaydi.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waybills' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE waybills ALTER COLUMN agent_id DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_debt_payments' AND column_name = 'agent_id'
  ) THEN
    ALTER TABLE agent_debt_payments ALTER COLUMN agent_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE waybills ADD COLUMN IF NOT EXISTS order_id INTEGER;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE waybills ADD COLUMN IF NOT EXISTS stock_posted BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waybills_order_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waybills' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE waybills
      ADD CONSTRAINT waybills_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_order
  ON waybills (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_idempotency
  ON waybills (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO settings (key, value, description) VALUES
  ('agents_ui_enabled', '0', 'Kelajakdagi diler/agent oynasi. 0 = yashirin, 1 = ochiq')
ON CONFLICT (key) DO NOTHING;
