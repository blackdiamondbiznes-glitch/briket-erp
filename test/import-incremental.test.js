const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const match = require('../lib/import-match');
const { runImport } = require('../scripts/import-mini-app');

const root = path.join(__dirname, '..');

function miniSet() {
  return {
    profiles: [],
    access_requests: [],
    stores: [{ id: 's1', name: "Do'kon", phone: '901112233' }],
    products: [],
    orders: [
      { id: 7, store_id: 's1', total_amount: 500, paid_amount: 0, debt_amount: 500, created_at: '2026-10-01' },
      { id: 8, store_id: 's1', total_amount: 200, paid_amount: 0, debt_amount: 200, created_at: '2026-10-02' },
    ],
    order_items: [
      { id: 1, order_id: 8, product_name: '1kg', quantity: 1, price: 200, subtotal: 200, commission: 0 },
    ],
    debt_payments: [
      { id: 2, store_id: 's1', amount: 100, created_at: '2026-10-03' },
      { id: 9, store_id: 's1', amount: 50, created_at: '2026-10-04' },
    ],
    commission_events: [],
    commission_withdrawals: [],
  };
}

function erpSnapshot() {
  return {
    customers: [{ id: 4, name: "Do'kon", phone: '901112233', legacy_id: 's1', legacy_source: 'briket-mini-app' }],
    products: [],
    waybills: [{ id: 50, legacy_id: '7', legacy_source: 'briket-mini-app', waybill_code: 'YX-LEG-7' }],
    payments: [{ id: 51, legacy_source: null, note: 'Yuk tarqatish tarix 2' }],
    agent_debt_payments: [{ id: 52, legacy_id: '2', legacy_source: 'briket-mini-app' }],
  };
}

test('dry-run counts only new waybills, payments, and customers', async () => {
  const logs = [];
  const dry = await runImport({
    apply: false,
    mini: miniSet(),
    erp: erpSnapshot(),
    links: {},
    log: (line) => logs.push(line),
  });
  assert.equal(dry.wrote, false);
  assert.equal(dry.plan.delta.new_waybills, 1);
  assert.equal(dry.plan.delta.new_payments, 1);
  assert.equal(dry.plan.delta.new_customers, 0);
  assert.match(logs[0], /DRY-RUN/);
  assert.match(logs.join('\n'), /Yangi qo'shiladi: yuk xati 1, to'lov 1, mijoz 0/);

  const codeOnly = erpSnapshot();
  codeOnly.waybills = [{ id: 50, legacy_id: null, legacy_source: null, waybill_code: 'YX-LEG-7' }];
  const again = match.buildImportPlan(miniSet(), codeOnly, {});
  assert.equal(again.delta.new_waybills, 1);
});

test('apply inserts only missing rows, sets payments.legacy_source, and does not update', async () => {
  const calls = [];
  let id = 80;
  const erpClient = {
    async query(sql, params) {
      calls.push({ sql: sql, params: params || [] });
      if (/BEGIN|COMMIT|ROLLBACK/i.test(sql)) return { rows: [] };
      if (/FROM waybills/i.test(sql)) {
        if (String(params[1]) === '7' || params[2] === 'YX-LEG-7') return { rows: [{ id: 50 }] };
        return { rows: [] };
      }
      if (/FROM agent_debt_payments/i.test(sql)) {
        if (String(params[1]) === '2') return { rows: [{ id: 52 }] };
        return { rows: [] };
      }
      if (/FROM payments/i.test(sql)) {
        if (params[0] === 'Yuk tarqatish tarix 2') return { rows: [{ id: 51 }] };
        return { rows: [] };
      }
      if (/FROM customers WHERE legacy_source/i.test(sql)) {
        if (String(params[1]) === 's1') return { rows: [{ id: 4 }] };
        return { rows: [] };
      }
      if (/FROM customer_map/i.test(sql)) return { rows: [{ id: 1 }] };
      if (/FROM waybill_items/i.test(sql)) return { rows: [] };
      if (/RETURNING/i.test(sql)) return { rows: [{ id: id++ }] };
      return { rows: [] };
    },
  };
  const applied = await runImport({
    apply: true,
    mini: miniSet(),
    erp: erpSnapshot(),
    links: {},
    erpClient: erpClient,
    log: () => {},
  });
  assert.equal(applied.wrote, true);
  const blob = calls.map((c) => c.sql).join('\n');
  assert.match(blob, /^BEGIN/);
  assert.match(blob, /COMMIT/);
  assert.doesNotMatch(blob, /\bUPDATE\b/i);
  assert.doesNotMatch(blob, /\bDELETE\b/i);
  assert.doesNotMatch(blob, /\bDROP\b/i);
  assert.doesNotMatch(blob, /\bTRUNCATE\b/i);
  const waybillInserts = calls.filter((c) => /INSERT INTO waybills/i.test(c.sql));
  assert.equal(waybillInserts.length, 1);
  assert.equal(waybillInserts[0].params[0], 'YX-LEG-8');
  assert.equal(waybillInserts[0].params[10], 'briket-mini-app');
  const payInserts = calls.filter((c) => /INSERT INTO payments/i.test(c.sql));
  assert.equal(payInserts.length, 1);
  assert.match(payInserts[0].sql, /legacy_source/);
  assert.equal(payInserts[0].params[2], 'Yuk tarqatish tarix 9');
  assert.equal(payInserts[0].params[4], 'briket-mini-app');
  assert.equal(calls.filter((c) => /INSERT INTO customers/i.test(c.sql)).length, 0);
  assert.equal(calls.filter((c) => /INSERT INTO agent_debt_payments/i.test(c.sql)).length, 1);
});

test('unmatched mini line is inserted with product_id null and stock_posted false', async () => {
  const calls = [];
  let id = 1;
  const erpClient = {
    async query(sql, params) {
      calls.push({ sql: sql, params: params || [] });
      if (/RETURNING/i.test(sql)) return { rows: [{ id: id++ }] };
      return { rows: [] };
    },
  };
  const mini = {
    profiles: [],
    access_requests: [],
    stores: [{ id: 's1', name: 'Do\'kon', phone: '901110000' }],
    products: [{ id: 'pr', owner_id: 'p', name: '9 kg' }],
    orders: [{ id: 1, owner_id: 'p', store_id: 's1', total_amount: 100, paid_amount: 0, debt_amount: 100 }],
    order_items: [{ id: 5, order_id: 1, product_name: '9 kg', quantity: 1, price: 100, subtotal: 100, commission: 20 }],
    debt_payments: [],
    commission_events: [],
    commission_withdrawals: [],
  };
  await runImport({
    apply: true,
    mini: mini,
    erp: { customers: [], products: [{ id: 3, sku: 'boshqa', weight_kg: 1 }] },
    links: {},
    erpClient: erpClient,
    log: () => {},
  });
  const item = calls.find((c) => /INSERT INTO waybill_items/i.test(c.sql));
  const bill = calls.find((c) => /INSERT INTO waybills/i.test(c.sql));
  assert.ok(item);
  assert.equal(item.params[1], null);
  assert.equal(item.params[2], '9 kg');
  assert.match(bill.sql, /stock_posted/);
  assert.match(bill.sql, /false/);
  const blob = calls.map((c) => c.sql).join('\n');
  assert.doesNotMatch(blob, /UPDATE\s+products/i);
  assert.doesNotMatch(blob, /stock_posted\s*=\s*true/i);
});

test('import script stays insert-only and documents dry-run', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/import-mini-app.js'), 'utf8');
  assert.match(src, /--dry-run/);
  assert.match(src, /MINI_DATABASE_URL/);
  assert.match(src, /DATABASE_URL/);
  assert.doesNotMatch(src, /postgres:\/\//i);
  assert.doesNotMatch(src, /\bUPDATE\b/i);
  assert.doesNotMatch(src, /\bDELETE\s+FROM\b/i);
  const start = src.indexOf('async function applyImport');
  const end = src.indexOf('async function runImport');
  const body = src.slice(start, end);
  assert.match(body, /legacy_source/);
  assert.match(body, /legacyWaybillCode/);
  assert.match(fs.readFileSync(path.join(root, 'lib/import-match.js'), 'utf8'), /YX-LEG-/);
  assert.doesNotMatch(body, /\bUPDATE\b/i);
});
