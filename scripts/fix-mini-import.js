#!/usr/bin/env node
/**
 * Import qilingan legacy yuk xati va to'lov taqsimini mini-app bilan solishtiradi.
 * Faqat legacy_source = briket-mini-app.
 * O'chirmaydi. Sukut va --dry-run yozmaydi. --apply bitta tranzaksiyada yozadi.
 *
 *   node scripts/fix-mini-import.js --dry-run
 *   node scripts/fix-mini-import.js --apply
 *
 * Env (qiymatni kodga yozmang):
 *   MINI_DATABASE_URL
 *   DATABASE_URL
 */
const { Pool } = require('pg');
const { readMini } = require('./import-mini-app');
const { LEGACY_SOURCE, planLegacyMoney } = require('../lib/import-match');

function poolFor(url) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 10000,
  });
}

function whole(v) {
  return Math.round(Number(v) || 0);
}

function paymentLegacyId(row) {
  const note = String((row && row.note) || '');
  const prefix = 'Yuk tarqatish tarix ';
  if (note.indexOf(prefix) === 0) return note.slice(prefix.length);
  if (row && row.legacy_id != null && String(row.legacy_id) !== '') return String(row.legacy_id);
  return '';
}

function buildFixPlan(mini, erp) {
  const waybills = (erp.waybills || []).filter(function (row) {
    return row.legacy_source === LEGACY_SOURCE;
  });
  const byOrder = {};
  waybills.forEach(function (row) {
    if (row.legacy_id == null || String(row.legacy_id) === '') return;
    byOrder[String(row.legacy_id)] = row;
  });
  const payByLegacy = {};
  (erp.payments || []).forEach(function (row) {
    if (row.legacy_source !== LEGACY_SOURCE) return;
    const legacyId = paymentLegacyId(row);
    if (!legacyId || payByLegacy[legacyId]) return;
    payByLegacy[legacyId] = row;
  });
  const haveAlloc = {};
  const allocByWaybill = {};
  const allocByPayment = {};
  (erp.allocations || []).forEach(function (row) {
    const amount = whole(row.amount);
    haveAlloc[String(row.payment_id) + '|' + String(row.waybill_id) + '|' + amount] = true;
    allocByWaybill[String(row.waybill_id)] = (allocByWaybill[String(row.waybill_id)] || 0) + amount;
    allocByPayment[String(row.payment_id)] = (allocByPayment[String(row.payment_id)] || 0) + amount;
  });
  const allocatedByOrder = {};
  waybills.forEach(function (row) {
    if (row.legacy_id == null || String(row.legacy_id) === '') return;
    allocatedByOrder[String(row.legacy_id)] = allocByWaybill[String(row.id)] || 0;
  });
  const allocatedByPayment = {};
  Object.keys(payByLegacy).forEach(function (legacyId) {
    allocatedByPayment[legacyId] = allocByPayment[String(payByLegacy[legacyId].id)] || 0;
  });
  const names = {};
  (mini.stores || []).forEach(function (store) { names[String(store.id)] = store.name || ''; });
  const money = planLegacyMoney(mini.orders || [], mini.debt_payments || []);
  const planned = planLegacyMoney(mini.orders || [], mini.debt_payments || [], {
    allocatedByOrder: allocatedByOrder,
    allocatedByPayment: allocatedByPayment,
  });
  const rows = [];
  const allocations = [];
  Object.keys(money.byOrder).forEach(function (legacyId) {
    const target = money.byOrder[legacyId];
    const current = byOrder[legacyId];
    if (!current) return;
    const order = (mini.orders || []).find(function (row) { return String(row.id) === legacyId; });
    const before = {
      paid: whole(current.paid_amount),
      debt: whole(current.debt_amount),
      status: current.status || '',
    };
    const after = {
      paid: target.paid_amount,
      debt: target.debt_amount,
      status: target.status,
    };
    rows.push({
      id: current.id,
      code: current.waybill_code,
      name: order ? (names[String(order.store_id)] || '') : '',
      before: before,
      after: after,
      dirty: before.paid !== after.paid || before.debt !== after.debt || before.status !== after.status,
    });
  });
  planned.allocations.forEach(function (alloc) {
    const current = byOrder[alloc.order_legacy_id];
    const pay = payByLegacy[alloc.payment_legacy_id];
    if (!current || !pay || !(alloc.amount > 0)) return;
    const key = String(pay.id) + '|' + String(current.id) + '|' + alloc.amount;
    if (haveAlloc[key]) return;
    allocations.push({
      payment_id: pay.id,
      waybill_id: current.id,
      amount: alloc.amount,
      code: current.waybill_code,
      payment_legacy_id: alloc.payment_legacy_id,
    });
  });
  const checks = allocationChecks(waybills, erp.allocations || [], allocations);
  return { rows: rows, allocations: allocations, checks: checks };
}

function allocationChecks(waybills, existing, added) {
  const book = {};
  (waybills || []).forEach(function (row) {
    if (row.legacy_source !== LEGACY_SOURCE) return;
    const paid = whole(row.paid_amount);
    const debt = whole(row.debt_amount);
    const total = whole(row.total_amount) || (paid + debt);
    book[String(row.id)] = { code: row.waybill_code || '', total: total, sum: 0 };
  });
  function add(waybillId, amount) {
    const slot = book[String(waybillId)];
    if (!slot) return;
    slot.sum += whole(amount);
  }
  (existing || []).forEach(function (row) { add(row.waybill_id, row.amount); });
  (added || []).forEach(function (row) { add(row.waybill_id, row.amount); });
  const lines = [];
  let bad = 0;
  Object.keys(book).forEach(function (id) {
    const row = book[id];
    const ok = row.sum <= row.total;
    if (!ok) bad += 1;
    lines.push({ code: row.code, sum: row.sum, total: row.total, ok: ok });
  });
  lines.sort(function (a, b) { return String(a.code).localeCompare(String(b.code)); });
  return { lines: lines, bad: bad };
}

function printFix(plan, log) {
  const out = log || console.log;
  out('kod\tdo\'kon\tpul oldin -> keyin\tholat oldin -> keyin');
  if (!plan.rows.length) out('Legacy yuk xati topilmadi.');
  plan.rows.forEach(function (row) {
    out(
      row.code + '\t' + (row.name || '-') +
      '\tpaid ' + row.before.paid + ' -> ' + row.after.paid +
      ', debt ' + row.before.debt + ' -> ' + row.after.debt +
      '\t' + (row.before.status || '-') + ' -> ' + row.after.status +
      (row.dirty ? '' : '\to\'zgarish yo\'q')
    );
  });
  if (!plan.allocations.length) out('Yangi allocation yo\'q.');
  plan.allocations.forEach(function (row) {
    out('ALLOC\t' + row.code + '\tpayment #' + row.payment_id + '\t' + row.amount);
  });
  const dirty = plan.rows.filter(function (row) { return row.dirty; }).length;
  out('Jami: yuk xati tuzatish ' + dirty + ', yangi allocation ' + plan.allocations.length);
  out('--- sum(allocations) <= total ---');
  const checks = plan.checks || { lines: [], bad: 0 };
  if (!checks.lines.length) out('Tekshiruv uchun legacy yuk xati yo\'q.');
  checks.lines.forEach(function (row) {
    out(
      (row.ok ? 'ok' : 'XATO') + '\t' + row.code +
      '\talloc ' + row.sum + ' <= total ' + row.total
    );
  });
  if (checks.bad) out('XATO: ' + checks.bad + ' yuk xatida allocation jami totaldan oshadi');
}

async function readErpLegacy(client) {
  await client.query('SET default_transaction_read_only = on');
  const waybills = await client.query(
    `SELECT w.id, w.waybill_code, w.legacy_id, w.legacy_source, w.total_amount, w.paid_amount, w.debt_amount, w.status
     FROM waybills w
     WHERE w.legacy_source = $1`,
    [LEGACY_SOURCE]
  );
  const payments = await client.query(
    `SELECT id, amount, note, legacy_source
     FROM payments
     WHERE legacy_source = $1`,
    [LEGACY_SOURCE]
  );
  const allocations = await client.query(
    `SELECT a.payment_id, a.waybill_id, a.amount
     FROM payment_allocations a
     JOIN payments p ON p.id = a.payment_id
     WHERE p.legacy_source = $1`,
    [LEGACY_SOURCE]
  );
  return {
    waybills: waybills.rows,
    payments: payments.rows,
    allocations: allocations.rows,
  };
}

async function applyFix(client, plan) {
  await client.query('BEGIN');
  try {
    for (const row of plan.rows) {
      if (!row.dirty) continue;
      await client.query(
        `UPDATE waybills
         SET paid_amount = $1, debt_amount = $2, status = $3
         WHERE id = $4 AND legacy_source = $5`,
        [row.after.paid, row.after.debt, row.after.status, row.id, LEGACY_SOURCE]
      );
    }
    for (const row of plan.allocations) {
      await client.query(
        `INSERT INTO payment_allocations (payment_id, waybill_id, amount)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM payment_allocations
           WHERE payment_id = $1 AND waybill_id = $2 AND amount = $3
         )`,
        [row.payment_id, row.waybill_id, row.amount]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    throw err;
  }
}

async function main() {
  const wantsApply = process.argv.indexOf('--apply') !== -1;
  const wantsDry = process.argv.indexOf('--dry-run') !== -1;
  if (wantsApply && wantsDry) {
    console.error('--dry-run va --apply birga emas.');
    process.exit(1);
  }
  const apply = wantsApply;
  const miniUrl = (process.env.MINI_DATABASE_URL || '').trim();
  const erpUrl = (process.env.DATABASE_URL || '').trim();
  if (!miniUrl) {
    console.error('MINI_DATABASE_URL kerak');
    process.exit(1);
  }
  if (!erpUrl) {
    console.error('DATABASE_URL kerak');
    process.exit(1);
  }
  if (miniUrl === erpUrl) {
    console.error('MINI_DATABASE_URL va DATABASE_URL bir xil bo\'lmasin');
    process.exit(1);
  }
  const miniPool = poolFor(miniUrl);
  const erpPool = poolFor(erpUrl);
  try {
    const mini = await readMini(miniPool);
    if (!apply) {
      const erp = await readErpLegacy(erpPool);
      const plan = buildFixPlan(mini, erp);
      console.log('DRY-RUN — hech narsa yozilmaydi');
      printFix(plan);
      return;
    }
    const snap = await erpPool.connect();
    try {
      const erp = await readErpLegacy(snap);
      await snap.query('SET default_transaction_read_only = off');
      const plan = buildFixPlan(mini, erp);
      console.log('APPLY — faqat legacy_source=' + LEGACY_SOURCE);
      printFix(plan);
      await applyFix(snap, plan);
    } finally {
      snap.release();
    }
  } finally {
    await miniPool.end();
    await erpPool.end();
  }
}

if (require.main === module) {
  main().catch(function (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  buildFixPlan: buildFixPlan,
  printFix: printFix,
  applyFix: applyFix,
  allocationChecks: allocationChecks,
};
