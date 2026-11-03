const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const match = require('../lib/import-match');
const { buildFixPlan, applyFix, matchesExpectedFix } = require('../scripts/fix-mini-import');

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

test('prod legacy fix keeps mini paid and allocates the three open payments', () => {
  const mini = {
    stores: [
      { id: 'sham', name: 'Shamaton' },
      { id: 'ali', name: 'Alipolvon' },
      { id: 'mari', name: 'Marinovka' },
      { id: 'tosh', name: 'Toshkent' },
    ],
    orders: [
      { id: 1, store_id: 'sham', total_amount: 1374000, paid_amount: 774000, debt_amount: 600000, created_at: '2026-09-01' },
      { id: 2, store_id: 'sham', total_amount: 1412000, paid_amount: 1412000, debt_amount: 0, created_at: '2026-10-01' },
      { id: 18, store_id: 'sham', total_amount: 2290000, paid_amount: 1500000, debt_amount: 790000, created_at: '2026-10-02' },
      { id: 21, store_id: 'sham', total_amount: 500000, paid_amount: 500000, debt_amount: 0, created_at: '2026-10-20' },
      { id: 8, store_id: 'ali', total_amount: 458000, paid_amount: 268000, debt_amount: 190000, created_at: '2026-10-01' },
      { id: 17, store_id: 'mari', total_amount: 1200000, paid_amount: 916000, debt_amount: 284000, created_at: '2026-10-01' },
      { id: 19, store_id: 'tosh', total_amount: 916000, paid_amount: 0, debt_amount: 916000, created_at: '2026-10-03' },
    ],
    debt_payments: [
      { id: 24, store_id: 'sham', amount: 1500000, created_at: '2026-10-03' },
      { id: 23, store_id: 'ali', amount: 138000, created_at: '2026-10-04' },
      { id: 25, store_id: 'mari', amount: 916000, created_at: '2026-10-05' },
    ],
  };
  const erp = {
    waybills: [
      { id: 12, waybill_code: 'YX-LEG-1', legacy_id: '1', legacy_source: 'briket-mini-app', total_amount: 1374000, paid_amount: 774000, debt_amount: 600000, status: 'partial' },
      { id: 7, waybill_code: 'YX-LEG-2', legacy_id: '2', legacy_source: 'briket-mini-app', total_amount: 1412000, paid_amount: 1412000, debt_amount: 0, status: 'paid' },
      { id: 18, waybill_code: 'YX-LEG-18', legacy_id: '18', legacy_source: 'briket-mini-app', total_amount: 2290000, paid_amount: 2290000, debt_amount: 0, status: 'paid' },
      { id: 21, waybill_code: 'YX-LEG-21', legacy_id: '21', legacy_source: 'briket-mini-app', total_amount: 500000, paid_amount: 500000, debt_amount: 0, status: 'paid' },
      { id: 8, waybill_code: 'YX-LEG-8', legacy_id: '8', legacy_source: 'briket-mini-app', total_amount: 458000, paid_amount: 138000, debt_amount: 190000, status: 'partial' },
      { id: 17, waybill_code: 'YX-LEG-17', legacy_id: '17', legacy_source: 'briket-mini-app', total_amount: 1200000, paid_amount: 916000, debt_amount: 284000, status: 'partial' },
      { id: 19, waybill_code: 'YX-LEG-19', legacy_id: '19', legacy_source: 'briket-mini-app', total_amount: 916000, paid_amount: 916000, debt_amount: 0, status: 'paid' },
    ],
    payments: [
      { id: 3, amount: 774000, note: 'naqd', legacy_source: null },
      { id: 4, amount: 1412000, note: 'naqd', legacy_source: null },
      { id: 9, amount: 130000, note: 'naqd', legacy_source: null },
      { id: 24, amount: 1500000, note: 'Yuk tarqatish tarix 24', legacy_source: 'briket-mini-app' },
      { id: 23, amount: 138000, note: 'Yuk tarqatish tarix 23', legacy_source: 'briket-mini-app' },
      { id: 25, amount: 916000, note: 'Yuk tarqatish tarix 25', legacy_source: 'briket-mini-app' },
    ],
    allocations: [
      { payment_id: 3, waybill_id: 12, amount: 774000 },
      { payment_id: 4, waybill_id: 7, amount: 1412000 },
      { payment_id: 9, waybill_id: 8, amount: 130000 },
    ],
  };
  const plan = buildFixPlan(mini, erp);
  const byCode = {};
  plan.rows.forEach(function (row) { byCode[row.code] = row; });
  assert.equal(byCode['YX-LEG-8'].after.paid, 268000);
  assert.equal(byCode['YX-LEG-8'].after.debt, 190000);
  assert.equal(byCode['YX-LEG-8'].after.status, 'partial');
  assert.equal(byCode['YX-LEG-18'].after.paid, 1500000);
  assert.equal(byCode['YX-LEG-18'].after.debt, 790000);
  assert.equal(byCode['YX-LEG-18'].after.status, 'partial');
  assert.equal(byCode['YX-LEG-19'].after.paid, 0);
  assert.equal(byCode['YX-LEG-19'].after.debt, 916000);
  assert.equal(byCode['YX-LEG-19'].after.status, 'open');
  assert.equal(byCode['YX-LEG-1'].dirty, false);
  assert.equal(byCode['YX-LEG-1'].after.debt, 600000);
  ['YX-LEG-2', 'YX-LEG-17', 'YX-LEG-21'].forEach(function (code) {
    assert.equal(byCode[code].dirty, false, code);
  });
  assert.deepEqual(
    plan.rows.filter(function (row) { return row.dirty; }).map(function (row) { return row.code; }).sort(),
    ['YX-LEG-18', 'YX-LEG-19', 'YX-LEG-8']
  );
  function alloc(code, paymentId) {
    return plan.allocations.filter(function (row) { return row.code === code && row.payment_id === paymentId; });
  }
  assert.equal(plan.allocations.length, 3);
  assert.equal(alloc('YX-LEG-18', 24).length, 1);
  assert.equal(alloc('YX-LEG-18', 24)[0].amount, 1500000);
  assert.equal(alloc('YX-LEG-8', 23).length, 1);
  assert.equal(alloc('YX-LEG-8', 23)[0].amount, 138000);
  assert.equal(alloc('YX-LEG-17', 25).length, 1);
  assert.equal(alloc('YX-LEG-17', 25)[0].amount, 916000);
  assert.equal(matchesExpectedFix(plan), true);
  const linked = buildFixPlan({
    stores: mini.stores,
    orders: mini.orders,
    debt_payments: [{ id: 24, store_id: 'sham', amount: 1500000, created_at: '2026-10-03', order_id: 1 }],
    commission_events: [],
  }, {
    waybills: erp.waybills,
    payments: [erp.payments[3]],
    allocations: [],
  });
  assert.equal(linked.allocations.length, 1);
  assert.equal(linked.allocations[0].code, 'YX-LEG-1');
  assert.equal(linked.allocations[0].amount, 1500000);
  const linkedOne = linked.rows.find(function (row) { return row.code === 'YX-LEG-1'; });
  assert.equal(linkedOne.after.debt, 600000);
  assert.equal(linkedOne.dirty, false);
  assert.equal(matchesExpectedFix(linked), false);
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
  assert.equal(byCode['YX-LEG-17'].after.debt, 1200000);
  assert.equal(byCode['YX-LEG-17'].dirty, false);
  assert.equal(plan.rows.some(function (row) { return row.code === 'YX-9'; }), false);
  assert.equal(plan.allocations.some(function (row) { return row.payment_id === 25 && row.waybill_id === 103 && row.amount === 916000; }), true);
  assert.equal(plan.allocations.some(function (row) { return row.payment_id === 24 && row.amount === 1500000; }), true);
  assert.equal(plan.paymentChecks.bad, 0);

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
  assert.equal(updates.length, 2);
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
  assert.match(src, /waybill_id IN \(SELECT id FROM waybills WHERE legacy_source = \$1\)/);
  assert.match(src, /sum\(allocations\) = amount/);
  assert.match(src, /matchesExpectedFix\(plan\)/);
  assert.match(src, /--apply yozilmadi/);
  const applyAt = src.indexOf('await applyFix(snap, plan)');
  const guardAt = src.indexOf('if (!matchesExpectedFix(plan))');
  assert.ok(guardAt !== -1 && applyAt !== -1 && guardAt < applyAt);
  assert.doesNotMatch(src, /JOIN payments p ON p\.id = a\.payment_id/);
  assert.doesNotMatch(src, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(src, /\bDROP\b/i);
  assert.doesNotMatch(src, /\bTRUNCATE\b/i);
  assert.doesNotMatch(src, /postgres:\/\//i);
});
