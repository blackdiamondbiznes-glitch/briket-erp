-- ============================================================
-- Briket ERP — agentlar / yuk xati (briket-mini-app phase 2)
-- ADD-ONLY. Qayta ishga tushirish xavfsiz.
-- Mavjud qatorlar o'chirilmaydi, ustunlar qayta nomlanmaydi.
-- Supabase SQL Editor da ishga tushiring. Productionga agent
-- yozmaydi — bu faylni qo'lda qo'llang.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS agents (
  id                      SERIAL PRIMARY KEY,
  telegram_id             BIGINT,
  telegram_username       TEXT,
  full_name               TEXT NOT NULL DEFAULT '',
  email                   TEXT,
  role                    TEXT NOT NULL DEFAULT 'agent',
  access_status           TEXT NOT NULL DEFAULT 'pending',
  commission_enabled_on   DATE,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  legacy_source           TEXT,
  legacy_id               TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_telegram
  ON agents (telegram_id) WHERE telegram_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_legacy
  ON agents (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agents_access ON agents (access_status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'agents_updated_at') THEN
    CREATE TRIGGER agents_updated_at
      BEFORE UPDATE ON agents
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_access_requests (
  id                  SERIAL PRIMARY KEY,
  telegram_id         BIGINT NOT NULL,
  telegram_username   TEXT,
  full_name           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  notify_message_id   BIGINT,
  decided_at          TIMESTAMPTZ,
  decided_by          TEXT,
  legacy_source       TEXT,
  legacy_id           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_access_status ON agent_access_requests (status);
CREATE INDEX IF NOT EXISTS idx_agent_access_tg ON agent_access_requests (telegram_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_access_one_pending
  ON agent_access_requests (telegram_id) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_access_legacy
  ON agent_access_requests (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS agent_id INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legacy_source TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legacy_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_agent_id_fkey'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_agent ON customers (agent_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_legacy
  ON customers (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS waybills (
  id                  BIGSERIAL PRIMARY KEY,
  waybill_code        TEXT NOT NULL UNIQUE,
  agent_id            INTEGER REFERENCES agents(id) ON DELETE RESTRICT,
  customer_id         INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  order_id            INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  debt_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date            DATE,
  status              TEXT NOT NULL DEFAULT 'open',
  note                TEXT,
  idempotency_key     TEXT,
  legacy_source       TEXT,
  legacy_id           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waybills_agent ON waybills (agent_id);
CREATE INDEX IF NOT EXISTS idx_waybills_customer ON waybills (customer_id);
CREATE INDEX IF NOT EXISTS idx_waybills_created ON waybills (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_legacy
  ON waybills (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_order
  ON waybills (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybills_idempotency
  ON waybills (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'waybills_updated_at') THEN
    CREATE TRIGGER waybills_updated_at
      BEFORE UPDATE ON waybills
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS waybill_items (
  id              SERIAL PRIMARY KEY,
  waybill_id      BIGINT NOT NULL REFERENCES waybills(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name    TEXT NOT NULL,
  quantity        NUMERIC(12,2) NOT NULL,
  price           NUMERIC(14,2) NOT NULL,
  subtotal        NUMERIC(14,2) NOT NULL,
  commission      NUMERIC(14,2) NOT NULL DEFAULT 0,
  legacy_source   TEXT,
  legacy_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_waybill_items_waybill ON waybill_items (waybill_id);
CREATE INDEX IF NOT EXISTS idx_waybill_items_product ON waybill_items (product_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_waybill_items_legacy
  ON waybill_items (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_debt_payments (
  id                    SERIAL PRIMARY KEY,
  agent_id              INTEGER REFERENCES agents(id) ON DELETE RESTRICT,
  customer_id           INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount                NUMERIC(14,2) NOT NULL,
  notes                 TEXT,
  applied_to_waybills   BOOLEAN NOT NULL DEFAULT true,
  legacy_source         TEXT,
  legacy_id             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_debt_pay_agent ON agent_debt_payments (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_debt_pay_customer ON agent_debt_payments (customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_debt_pay_legacy
  ON agent_debt_payments (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_debt_allocations (
  id                  SERIAL PRIMARY KEY,
  debt_payment_id     INTEGER NOT NULL REFERENCES agent_debt_payments(id) ON DELETE RESTRICT,
  waybill_id          BIGINT NOT NULL REFERENCES waybills(id) ON DELETE RESTRICT,
  amount              NUMERIC(14,2) NOT NULL,
  commission_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  legacy_source       TEXT,
  legacy_id           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_debt_alloc_payment ON agent_debt_allocations (debt_payment_id);
CREATE INDEX IF NOT EXISTS idx_agent_debt_alloc_waybill ON agent_debt_allocations (waybill_id);

CREATE TABLE IF NOT EXISTS agent_commission_events (
  id                SERIAL PRIMARY KEY,
  agent_id          INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  waybill_id        BIGINT REFERENCES waybills(id) ON DELETE SET NULL,
  debt_payment_id   INTEGER REFERENCES agent_debt_payments(id) ON DELETE SET NULL,
  amount            NUMERIC(14,2) NOT NULL,
  source            TEXT NOT NULL,
  legacy_source     TEXT,
  legacy_id         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_comm_agent ON agent_commission_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_comm_waybill ON agent_commission_events (waybill_id);
CREATE INDEX IF NOT EXISTS idx_agent_comm_payment ON agent_commission_events (debt_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_comm_legacy
  ON agent_commission_events (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_commission_withdrawals (
  id              SERIAL PRIMARY KEY,
  agent_id        INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  amount          NUMERIC(14,2) NOT NULL,
  notes           TEXT,
  legacy_source   TEXT,
  legacy_id       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_withdraw_agent ON agent_commission_withdrawals (agent_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_withdraw_legacy
  ON agent_commission_withdrawals (legacy_source, legacy_id)
  WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL;

-- legacy uuid -> ERP id. Map qatori mijoz/mahsulot o'chirilsa ketadi,
-- mavjud hard-delete endpointini to'sib qo'ymaslik uchun.
CREATE TABLE IF NOT EXISTS customer_map (
  id              SERIAL PRIMARY KEY,
  legacy_uuid     TEXT NOT NULL,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  agent_id        INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  legacy_source   TEXT NOT NULL DEFAULT 'briket-mini-app',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_source, legacy_uuid)
);

CREATE INDEX IF NOT EXISTS idx_customer_map_customer ON customer_map (customer_id);

CREATE TABLE IF NOT EXISTS product_map (
  id              SERIAL PRIMARY KEY,
  legacy_uuid     TEXT NOT NULL,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  agent_id        INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  legacy_source   TEXT NOT NULL DEFAULT 'briket-mini-app',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legacy_source, legacy_uuid)
);

CREATE INDEX IF NOT EXISTS idx_product_map_product ON product_map (product_id);
