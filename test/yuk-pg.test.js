/**
 * Lokal Postgres. YUK_TEST_DATABASE_URL bo'sh bo'lsa o'tkazib yuboriladi.
 * Host localhost, 127.0.0.1 yoki soket (bo'sh host) bo'lishi shart.
 * Production URL berilsa test yiqiladi, ulanmaydi.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createSqlStore } = require('../lib/agent-repo');
const { createYukService } = require('../lib/yuk-service');

const url = (process.env.YUK_TEST_DATABASE_URL || '').trim();

function localUrl(value) {
  const parsed = new URL(value);
  const host = parsed.hostname;
  return host === '' || host === 'localhost' || host === '127.0.0.1';
}

const skip = !url;
if (url && !localUrl(url)) {
  throw new Error('YUK_TEST_DATABASE_URL faqat lokal Postgres bo\'lishi kerak');
}

let pool;
let service;

async function reset() {
  await pool.query(`
    TRUNCATE TABLE
      payment_allocations,
      store_credits,
      waybill_items,
      payments,
      waybills,
      agent_debt_payments,
      customers,
      products
    RESTART IDENTITY CASCADE
  `);
  await pool.query(
    `INSERT INTO products (sku, price, is_active) VALUES ('1kg Oddiy', 8000, true)`
  );
}

test.before(async () => {
  if (skip) return;
  pool = new Pool({ connectionString: url });
  await pool.query('SELECT 1');
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'waybills' AND column_name IN ('sale_date', 'request_id')`
  );
  assert.equal(cols.rows.length, 2);
  service = createYukService(createSqlStore(pool), {
    tashkentDateStr: function () { return '2026-10-22'; },
  });
});

test.after(async () => {
  if (pool) await pool.end();
});

test('postgres: sale allocations, replay, and legacy paid stay visible', { skip: skip }, async () => {
  await reset();
  const customer = await service.createCustomer({
    name: 'Chorsu',
    phone: '901112233',
    address: 'Bozor',
  });
  const legacy = await pool.query(
    `INSERT INTO waybills
       (waybill_code, customer_id, total_amount, paid_amount, debt_amount,
        sale_date, due_date, status, stock_posted, legacy_source)
     VALUES ('YX-LEGACY-1', $1, 1000, 700, 300, '2026-08-01', '2026-08-20', 'open', false, 'briket-mini-app')
     RETURNING id`,
    [customer.id]
  );
  await pool.query(
    `INSERT INTO waybill_items (waybill_id, product_name, quantity, price, subtotal)
     VALUES ($1, '1kg Oddiy', 1, 1000, 1000)`,
    [legacy.rows[0].id]
  );
  const shown = await service.customerDetail(customer.id);
  const old = shown.waybills.find((w) => w.legacy_source);
  assert.equal(old.paid_amount, 700);
  assert.equal(old.debt_amount, 300);
  assert.equal(old.stock_posted, false);

  const body = {
    request_id: 'req-pg-sale-0001',
    customer_id: customer.id,
    sale_date: '2026-10-22',
    naqd: 500,
    karta: 200,
    due_date: '2026-10-25',
    items: [{ product_id: 1, quantity: 2, price: 1000, subtotal: 1, total_amount: 5 }],
  };
  const first = await service.createSale(body);
  assert.equal(first.total_amount, 2000);
  assert.equal(first.paid_amount, 700);
  assert.equal(first.debt_amount, 1300);
  assert.match(first.waybill_code, /^YX-20261022-\d{6}$/);
  const sums = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM payments p WHERE p.customer_id = $1 AND p.kind = 'collection')::int AS pays,
       (SELECT COALESCE(SUM(a.amount),0) FROM payment_allocations a WHERE a.waybill_id = $2)::int AS alloc,
       (SELECT paid_amount FROM waybills WHERE id = $2)::int AS paid
     `,
    [customer.id, first.id]
  );
  assert.equal(sums.rows[0].pays, 2);
  assert.equal(sums.rows[0].alloc, 700);
  assert.equal(sums.rows[0].paid, 700);

  const again = await service.createSale(body);
  assert.equal(again.replay, true);
  assert.equal(again.id, first.id);
  await assert.rejects(
    () => pool.query(
      `INSERT INTO waybills
         (waybill_code, customer_id, total_amount, paid_amount, debt_amount, request_id, sale_date, status)
       VALUES ('YX-DUP', $1, 1, 0, 1, $2, '2026-10-22', 'open')`,
      [customer.id, body.request_id]
    ),
    (err) => err && err.code === '23505'
  );

  const fresh = await service.createSale({
    request_id: 'req-pg-overpay-01',
    customer_id: customer.id,
    sale_date: '2026-10-22',
    naqd: 1500,
    karta: 0,
    items: [{ product_id: 1, quantity: 1, price: 1000 }],
  });
  assert.equal(fresh.paid_amount, 1000);
  assert.equal(fresh.debt_amount, 0);
  const legacyAfter = (await service.customerDetail(customer.id)).waybills
    .find((w) => w.legacy_source);
  assert.equal(legacyAfter.paid_amount, 1000);
  assert.equal(legacyAfter.debt_amount, 0);
  const backfill = await pool.query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE customer_id = $1 AND kind = 'backfill'`,
    [customer.id]
  );
  assert.equal(backfill.rows[0].n, 1);
});

test('postgres: customer row lock blocks a second sale until commit', { skip: skip }, async () => {
  await reset();
  const customer = await service.createCustomer({ name: 'Qulf' });
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [customer.id]);
    let settled = false;
    const pending = service.createSale({
      request_id: 'req-pg-lock-0001',
      customer_id: customer.id,
      sale_date: '2026-10-22',
      naqd: 0,
      karta: 0,
      due_date: '2026-10-22',
      items: [{ product_id: 1, quantity: 1, price: 1000 }],
    }).then((row) => {
      settled = true;
      return row;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(settled, false);
    await holder.query('COMMIT');
    const saved = await pending;
    assert.equal(settled, true);
    assert.equal(saved.debt_amount, 1000);
  } finally {
    try { await holder.query('ROLLBACK'); } catch (e) { /* allaqachon yopilgan */ }
    holder.release();
  }
});

test('postgres: edit keeps allocated money and reversal does not delete', { skip: skip }, async () => {
  await reset();
  const customer = await service.createCustomer({ name: 'Tahrir' });
  const paid = await service.createSale({
    request_id: 'req-pg-edit-0001',
    customer_id: customer.id,
    sale_date: '2026-10-22',
    naqd: 1000,
    karta: 0,
    items: [{ product_id: 1, quantity: 1, price: 1000 }],
  });
  const edited = await service.editSale(paid.id, {
    sale_date: '2026-10-22',
    items: [{ product_id: 1, quantity: 1, price: 400 }],
  });
  assert.equal(edited.total_amount, 400);
  assert.equal(edited.paid_amount, 400);
  assert.equal(edited.debt_amount, 0);
  const credit = await pool.query(
    'SELECT COALESCE(SUM(amount),0)::int AS n FROM store_credits WHERE customer_id = $1',
    [customer.id]
  );
  assert.equal(credit.rows[0].n, 600);
  const before = await pool.query('SELECT COUNT(*)::int AS n FROM payments');
  const pay = await service.collectPayment(customer.id, {
    request_id: 'req-pg-pay-0001',
    amount: 100,
    method: 'cash',
  });
  assert.equal(pay.store_credit >= 0, true);
  const rev = await service.reversePayment(pay.payment.id, { request_id: 'req-pg-rev-0001' });
  assert.equal(rev.deleted, false);
  const after = await pool.query('SELECT COUNT(*)::int AS n FROM payments');
  assert.equal(after.rows[0].n, before.rows[0].n + 2);
  const gone = await pool.query('SELECT id FROM payments WHERE id = $1', [pay.payment.id]);
  assert.equal(gone.rows.length, 1);
});
