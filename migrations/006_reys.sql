-- ============================================================
-- Yuk tarqatish reysi va test qarzini arxivlash jadvali.
-- Qayta ishga tushirish xavfsiz. Mavjud qatorlar o'chirilmaydi,
-- ustunlar qayta nomlanmaydi.
-- Reys: yuk ombordan yo'lga chiqadi. Shu reysdagi yuk xati
-- ombordan ikkinchi marta ayirilmaydi. Yopilganda qoldiq qaytadi.
-- archived_rows — cleanup skripti nusxa qo'yadigan joy.
-- ============================================================

CREATE TABLE IF NOT EXISTS reyslar (
  id               BIGSERIAL PRIMARY KEY,
  reys_code        TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'open',
  note             TEXT,
  idempotency_key  TEXT,
  loaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reyslar_idempotency
  ON reyslar (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reyslar_status ON reyslar (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reyslar_updated_at') THEN
    CREATE TRIGGER reyslar_updated_at
      BEFORE UPDATE ON reyslar
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reys_items (
  id            BIGSERIAL PRIMARY KEY,
  reys_id       BIGINT NOT NULL REFERENCES reyslar(id) ON DELETE RESTRICT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  loaded_qty    NUMERIC(12,2) NOT NULL,
  returned_qty  NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (reys_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reys_items_reys ON reys_items (reys_id);
CREATE INDEX IF NOT EXISTS idx_reys_items_product ON reys_items (product_id);

ALTER TABLE waybills ADD COLUMN IF NOT EXISTS reys_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waybills_reys_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'waybills' AND column_name = 'reys_id'
  ) THEN
    ALTER TABLE waybills
      ADD CONSTRAINT waybills_reys_id_fkey
      FOREIGN KEY (reys_id) REFERENCES reyslar(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_waybills_reys ON waybills (reys_id);

CREATE TABLE IF NOT EXISTS archived_rows (
  id            BIGSERIAL PRIMARY KEY,
  batch_key     TEXT NOT NULL,
  source_table  TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  row_data      JSONB NOT NULL,
  archived_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_rows_batch ON archived_rows (batch_key);
CREATE INDEX IF NOT EXISTS idx_archived_rows_source ON archived_rows (source_table, source_id);
