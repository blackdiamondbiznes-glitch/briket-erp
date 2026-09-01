-- ============================================================
-- Black Diamond / Briket ERP — ma'lumotlar bazasi sxemasi
-- Supabase SQL Editor da ishga tushiring
-- ============================================================
-- Versiya: 2.0 (partners + shipments + savdo kanallari)
-- ============================================================

-- Yangilanish vaqti uchun umumiy funksiya
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================== 1. MATERIALLAR (xom ashyo) =====================
CREATE TABLE IF NOT EXISTS materials (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  unit          TEXT NOT NULL DEFAULT 'kg',
  price         NUMERIC(14,2) NOT NULL DEFAULT 0,
  initial_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS materials_updated_at ON materials;
CREATE TRIGGER materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  weight_kg     NUMERIC(10,3) NOT NULL DEFAULT 0,
  price         NUMERIC(14,2) NOT NULL DEFAULT 0,
  description   TEXT,
  image_urls    TEXT[] DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS recipes (
  id            SERIAL PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  qty           NUMERIC(14,4) NOT NULL,
  UNIQUE (product_id, material_id)
);

CREATE TABLE IF NOT EXISTS batches (
  id              SERIAL PRIMARY KEY,
  batch_code      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'active',
  bags_count      NUMERIC(12,2) NOT NULL DEFAULT 0,
  bag_price       NUMERIC(14,2) NOT NULL DEFAULT 0,
  bags_cost       NUMERIC(14,2) NOT NULL DEFAULT 0,
  estimated_kg    NUMERIC(14,3) NOT NULL DEFAULT 0,
  dry_kg          NUMERIC(14,3) NOT NULL DEFAULT 0,
  loss_percent    NUMERIC(8,2) NOT NULL DEFAULT 0,
  packed_kg       NUMERIC(14,3) NOT NULL DEFAULT 0,
  remaining_kg    NUMERIC(14,3) NOT NULL DEFAULT 0,
  workers_count   INTEGER DEFAULT 0,
  press_wage      NUMERIC(14,2) DEFAULT 0,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS batches_updated_at ON batches;
CREATE TRIGGER batches_updated_at
  BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS packaging (
  id              SERIAL PRIMARY KEY,
  batch_id        INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty             NUMERIC(12,2) NOT NULL,
  kg              NUMERIC(14,3) NOT NULL,
  unit_wage       NUMERIC(14,2) NOT NULL DEFAULT 0,
  workers_count   INTEGER DEFAULT 1,
  total_wage      NUMERIC(14,2) NOT NULL DEFAULT 0,
  sell_price      NUMERIC(14,2),
  note            TEXT,
  packed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packaging_product ON packaging(product_id);
CREATE INDEX IF NOT EXISTS idx_packaging_batch ON packaging(batch_id);
CREATE INDEX IF NOT EXISTS idx_packaging_date ON packaging(packed_at);

CREATE TABLE IF NOT EXISTS material_movements (
  id            SERIAL PRIMARY KEY,
  material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out')),
  qty           NUMERIC(14,3) NOT NULL,
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  batch_id      INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  note          TEXT,
  moved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_mov_material ON material_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_mat_mov_date ON material_movements(moved_at);

CREATE TABLE IF NOT EXISTS partners (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  address         TEXT,
  type            TEXT NOT NULL DEFAULT 'customer'
                    CHECK (type IN ('customer', 'dealer', 'agent')),
  parent_id       INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  region          TEXT,
  district        TEXT,
  discount_type   TEXT NOT NULL DEFAULT 'none'
                    CHECK (discount_type IN ('none', 'bulk', 'fixed_amount', 'fixed_percent')),
  discount_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0,
  telegram_id     TEXT,
  login_pin       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_type ON partners(type);
CREATE INDEX IF NOT EXISTS idx_partners_phone ON partners(phone);
CREATE INDEX IF NOT EXISTS idx_partners_telegram ON partners(telegram_id);
CREATE INDEX IF NOT EXISTS idx_partners_parent ON partners(parent_id);
CREATE INDEX IF NOT EXISTS idx_partners_region ON partners(region);

DROP TRIGGER IF EXISTS partners_updated_at ON partners;
CREATE TRIGGER partners_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS customers (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  address         TEXT,
  credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 0,
  telegram_id     TEXT,
  note            TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_telegram ON customers(telegram_id);

DROP TRIGGER IF EXISTS customers_updated_at ON customers;
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  order_code      TEXT NOT NULL UNIQUE,
  partner_id      INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  partner_type    TEXT,
  partner_name    TEXT,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   TEXT,
  phone           TEXT,
  dealer_id       INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  debt_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  debt_due        DATE,
  source          TEXT DEFAULT 'admin',
  note            TEXT,
  admin_note      TEXT,
  ordered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_dealer ON orders(dealer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(ordered_at);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  sku           TEXT NOT NULL,
  qty           NUMERIC(12,2) NOT NULL,
  unit_price    NUMERIC(14,2) NOT NULL,
  list_price    NUMERIC(14,2),
  discount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total    NUMERIC(14,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  partner_id    INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  amount        NUMERIC(14,2) NOT NULL,
  method        TEXT DEFAULT 'cash',
  note          TEXT,
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_partner ON payments(partner_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS expenses (
  id              SERIAL PRIMARY KEY,
  category        TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  payment_method  TEXT DEFAULT 'cash',
  batch_id        INTEGER REFERENCES batches(id) ON DELETE SET NULL,
  note            TEXT,
  expense_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

CREATE TABLE IF NOT EXISTS shipments (
  id              SERIAL PRIMARY KEY,
  shipment_code   TEXT NOT NULL UNIQUE,
  from_type       TEXT NOT NULL DEFAULT 'factory'
                    CHECK (from_type IN ('factory', 'dealer')),
  from_partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  to_partner_id   INTEGER NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku             TEXT NOT NULL,
  qty             NUMERIC(12,2) NOT NULL,
  unit_price      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'given'
                    CHECK (status IN ('given', 'partial_return', 'returned', 'closed')),
  returned_qty    NUMERIC(12,2) NOT NULL DEFAULT 0,
  note            TEXT,
  given_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_to ON shipments(to_partner_id);
CREATE INDEX IF NOT EXISTS idx_shipments_from ON shipments(from_partner_id);
CREATE INDEX IF NOT EXISTS idx_shipments_product ON shipments(product_id);
CREATE INDEX IF NOT EXISTS idx_shipments_date ON shipments(given_at);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

DROP TRIGGER IF EXISTS shipments_updated_at ON shipments;
CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  description   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value, description) VALUES
  ('bulk_min_qty', '500', 'Oddiy mijoz uchun yirik xarid minimal dona'),
  ('bulk_min_kg', '1000', 'Oddiy mijoz uchun yirik xarid minimal kg'),
  ('bulk_discount', '3000', 'Yirik xaridda 1 donaga chegirma (som)'),
  ('default_credit_limit', '5000000', 'Yangi hamkor uchun default nasiya limiti'),
  ('currency', 'UZS', 'Valyuta'),
  ('low_stock_qty', '5', 'Kam qoldiq ogohlantirish chegarasi (dona)'),
  ('low_batch_kg', '50', 'Partiya tugash ogohlantirish chegarasi (kg)'),
  ('high_debt_threshold', '3000000', 'Yuqori qarz ogohlantirish chegarasi (som)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO materials (name, unit, price, initial_stock) VALUES
  ('Ko''mir kukuni (qop)', 'qop', 0, 0),
  ('Taxta reka (kubik)', 'dona', 0, 0),
  ('Parafin', 'kg', 0, 0),
  ('Paket 1kg', 'dona', 0, 0),
  ('Paket 1.5kg', 'dona', 0, 0),
  ('Paket 2kg', 'dona', 0, 0)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (sku, weight_kg, price) VALUES
  ('1kg Starter', 1, 0),
  ('2kg Starter', 2, 0),
  ('1kg Aktivator', 1, 0),
  ('1.5kg Aktivator', 1.5, 0),
  ('1kg Oddiy', 1, 0),
  ('2kg Oddiy', 2, 0)
ON CONFLICT (sku) DO NOTHING;
