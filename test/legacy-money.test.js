const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const match = require('../lib/import-match');
const { buildFixPlan, applyFix } = require('../scripts/fix-mini-import');

test('legacy money keeps applied payments and allocates the rest FIFO', () => {
  const shamaton = match.planStoreMoney(
    [{ id: 18, store_id: 'sham', total_amount: 2290000, paid_amount: 1500000, debt_amount: 790000, created_at: '2026-10-01' }],
    [{ id: 24, store_id: 'sham', amount: 1500000, created_at: '2026-10-02' }]
  );
  assert.equal(shamaton.orders[0].paid_amount, 1500000);
  assert.equal(shamaton.orders[0].debt_amount, 790000);
  assert.equal(shamaton.orders[0].status, 'partial');
  assert.equal(shamaton.allocations.length, 1);
  assert.equal(shamaton.allocations[0].amount, 1500000);

  const toshkent = match.planStoreMoney(
    [{ id: 19, store_id: 'tosh', total_amount: 916000, paid_amount: 0, debt_amount: 916000, created_at: '2026-10-03' }],
    []
  );
  assert.equal(toshkent.orders[0].paid_amount, 0);
  assert.equal(toshkent.orders[0].debt_amount, 916000);
  assert.equal(toshkent.orders[0].status, 'open');
  assert.equal(toshkent.allocations.length, 0);

  const alipolvon = match.planStoreMoney(
    [{ id: 8, store_id: 'ali', total_amount: 328000, paid_amount: 0, debt_amount: 328000, created_at: '2026-10-01' }],
    [{ id: 23, store_id: 'ali', amount: 138000, created_at: '2026-10-04' }]
  );
  assert.equal(alipolvon.orders[0].debt_amount, 190000);
  assert.equal(alipolvon.orders[0].paid_amount, 138000);
  assert.equal(alipolvon.allocations[0].amount, 138000);

  const both = match.planLegacyMoney(
    [
      { id: 19, store_id: 'tosh', total_amount: 916000, paid_amount: 0, debt_amount: 916000, created_at: '2026-10-03' },
      { id: 17, store_id: 'mari', total_amount: 1200000, paid_amount: 0, debt_amount: 1200000, created_at: '2026-10-01' },
    ],
    [{ id: 25, store_id: 'mari', amount: 916000, created_at: '2026-10-05' }]
  );
  assert.equal(both.byOrder['19'].debt_amount, 916000);
  assert.equal(both.byOrder['19'].status, 'open');
  assert.equal(both.byOrder['17'].debt_amount, 284000);
  assert.equal(both.byOrder['17'].paid_amount, 916000);
  assert.equal(both.allocations[0].order_legacy_id, '17');
  assert.equal(both.allocations[0].amount, 916000);
});

test('fix plan corrects legacy balances and is idempotent', async () => {
  const mini = {
    stores: [
      { id: 'tosh', name: 'Toshkent' },
      { id: 'sham', name: 'Shamaton' },
      { id: 'mari', name: 'Marinovka' },
    ],
    orders: [
      { id: 19, store_id: 'tosh', total_amount: 916000, paid_amount: 0, debt_amount: 916000, created_at: '2026-10-03' },
      { id: 18, store_id: 'sham', total_amount: 2290000, paid_amount: 1500000, debt_amount: 790000, created_at: '2026-10-01' },
      { id: 17, store_id: 'mari', total_amount: 1200000, paid_amount: 0, debt_amount: 1200000, created_at: '2026-10-01' },
    ],
    debt_payments: [
      { id: 24, store_id: 'sham', amount: 1500000, created_at: '2026-10-02' },
      { id: 25, store_id: 'mari', amount: 916000, created_at: '2026-10-05' },
    ],
  };
  const erp = {
    waybills: [
      { id: 101, waybill_code: 'YX-LEG-19', legacy_id: '19', legacy_source: 'briket-mini-app', paid_amount: 916000, debt_amount: 0, status: 'paid' },
      { id: 102, waybill_code: 'YX-LEG-18', legacy_id: '18', legacy_source: 'briket-mini-app', paid_amount: 2290000, debt_amount: 0, status: 'paid' },
      { id: 103, waybill_code: 'YX-LEG-17', legacy_id: '17', legacy_source: 'briket-mini-app', paid_amount: 0, debt_amount: 1200000, status: 'open' },
      { id: 104, waybill_code: 'YX-9', legacy_id: '9', legacy_source: null, paid_amount: 10, debt_amount: 0, status: 'paid' },
    ],
    payments: [
      { id: 24, amount: 1500000, note: 'Yuk tarqatish tarix 24', legacy_source: 'briket-mini-app' },
      { id: 25, amount: 916000, note: 'Yuk tarqatish tarix 25', legacy_source: 'briket-mini-app' },
    ],
    allocations: [],
  };
  const plan = buildFixPlan(mini, erp);
  const byCode = {};
  plan.rows.forEach(function (row) { byCode[row.code] = row; });
  assert.equal(byCode['YX-LEG-19'].after.debt, 916000);
  assert.equal(byCode['YX-LEG-19'].after.status, 'open');
  assert.equal(byCode['YX-LEG-18'].after.paid, 1500000);
  assert.equal(byCode['YX-LEG-18'].after.debt, 790000);
  assert.equal(byCode['YX-LEG-18'].after.status, 'partial');
  assert.equal(byCode['YX-LEG-17'].after.debt, 284000);
  assert.equal(plan.rows.some(function (row) { return row.code === 'YX-9'; }), false);
  assert.equal(plan.allocations.some(function (row) { return row.payment_id === 25 && row.waybill_id === 103 && row.amount === 916000; }), true);
  assert.equal(plan.allocations.some(function (row) { return row.payment_id === 24 && row.amount === 1500000; }), true);

  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql: sql, params: params || [] });
      return { rows: [] };
    },
  };
  await applyFix(client, plan);
  const blob = calls.map(function (row) { return row.sql; }).join('\n');
  assert.match(blob, /^BEGIN/);
  assert.match(blob, /COMMIT/);
  assert.doesNotMatch(blob, /\bDELETE\b/i);
  assert.doesNotMatch(blob, /\bDROP\b/i);
  assert.doesNotMatch(blob, /\bTRUNCATE\b/i);
  const updates = calls.filter(function (row) { return /UPDATE waybills/i.test(row.sql); });
  assert.equal(updates.length, 3);
  assert.ok(updates.every(function (row) { return row.params[4] === 'briket-mini-app'; }));

  const fixed = buildFixPlan(mini, {
    waybills: plan.rows.map(function (row) {
      return {
        id: row.id,
        waybill_code: row.code,
        legacy_id: row.code.slice('YX-LEG-'.length),
        legacy_source: 'briket-mini-app',
        paid_amount: row.after.paid,
        debt_amount: row.after.debt,
        status: row.after.status,
      };
    }),
    payments: erp.payments,
    allocations: plan.allocations.map(function (row) {
      return { payment_id: row.payment_id, waybill_id: row.waybill_id, amount: row.amount };
    }),
  });
  assert.equal(fixed.rows.filter(function (row) { return row.dirty; }).length, 0);
  assert.equal(fixed.allocations.length, 0);
});

test('fix script does not delete and defaults to dry-run', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/fix-mini-import.js'), 'utf8');
  assert.match(src, /--dry-run/);
  assert.match(src, /legacy_source = \$1/);
  assert.doesNotMatch(src, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(src, /\bDROP\b/i);
  assert.doesNotMatch(src, /\bTRUNCATE\b/i);
  assert.doesNotMatch(src, /postgres:\/\//i);
});
