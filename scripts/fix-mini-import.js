#!/usr/bin/env node
/**
 * Import qilingan legacy yuk xati va to'lov taqsimini mini-app bilan solishtiradi.
 * Faqat legacy_source = briket-mini-app.
 * O'chirmaydi. Sukut va --dry-run yozmaydi.
 * paid/debt mini order dan. Allocation faqat bo'sh legacy to'lovga, bitta qator.
 * --apply faqat kutilgan natija mos bo'lsa yozadi.
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
const { LEGACY_SOURCE } = require('../lib/import-match');

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

function moneyStatus(paid, debt) {
  if (debt <= 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'open';
}

function targetFromMini(order) {
  let total = whole(order.total_amount);
  const paidRaw = whole(order.paid_amount);
  const debtRaw = whole(order.debt_amount);
  if (!total) total = paidRaw + debtRaw;
  const paid = Math.min(total, Math.max(0, paidRaw));
  const debt = Math.max(0, total - paid);
  return { paid: paid, debt: debt, status: moneyStatus(paid, debt) };
}

function linkedOrderId(pay, events) {
  if (pay && pay.order_id != null && String(pay.order_id) !== '') return String(pay.order_id);
  const ids = {};
  (events || []).forEach(function (ev) {
    if (!pay || String(ev.debt_payment_id) !== String(pay.id)) return;
    if (ev.order_id == null || String(ev.order_id) === '') return;
    ids[String(ev.order_id)] = true;
  });
  const keys = Object.keys(ids);
  if (keys.length === 1) return keys[0];
  return '';
}

function latestOrderBefore(orders, storeId, at) {
  const when = String(at || '');
  let best = null;
  (orders || []).forEach(function (order) {
    if (String(order.store_id) !== String(storeId)) return;
    const created = String(order.created_at || '');
    if (when && created > when) return;
    if (!best) {
      best = order;
      return;
    }
    const bestAt = String(best.created_at || '');
    if (created > bestAt || (created === bestAt && String(order.id) > String(best.id))) best = order;
  });
  return best;
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
  const allocByPayment = {};
  (erp.allocations || []).forEach(function (row) {
    const id = String(row.payment_id);
    allocByPayment[id] = (allocByPayment[id] || 0) + whole(row.amount);
  });
  const names = {};
  (mini.stores || []).forEach(function (store) { names[String(store.id)] = store.name || ''; });
  const miniOrders = mini.orders || [];
  const miniById = {};
  miniOrders.forEach(function (order) { miniById[String(order.id)] = order; });
  const miniPayById = {};
  (mini.debt_payments || []).forEach(function (pay) { miniPayById[String(pay.id)] = pay; });
  const rows = [];
  const allocations = [];
  Object.keys(byOrder).forEach(function (legacyId) {
    const order = miniById[legacyId];
    const current = byOrder[legacyId];
    if (!order || !current) return;
    const target = targetFromMini(order);
    const before = {
      paid: whole(current.paid_amount),
      debt: whole(current.debt_amount),
      status: current.status || '',
    };
    rows.push({
      id: current.id,
      code: current.waybill_code,
      name: names[String(order.store_id)] || '',
      before: before,
      after: { paid: target.paid, debt: target.debt, status: target.status },
      dirty: before.paid !== target.paid || before.debt !== target.debt || before.status !== target.status,
    });
  });
  Object.keys(payByLegacy).forEach(function (legacyId) {
    const pay = payByLegacy[legacyId];
    if ((allocByPayment[String(pay.id)] || 0) > 0) return;
    const miniPay = miniPayById[legacyId];
    if (!miniPay) return;
    const linked = linkedOrderId(miniPay, mini.commission_events);
    const order = linked
      ? miniById[linked]
      : latestOrderBefore(miniOrders, miniPay.store_id, miniPay.created_at);
    if (!order) return;
    const current = byOrder[String(order.id)];
    const amount = whole(pay.amount);
    if (!current || !(amount > 0)) return;
    allocations.push({
      payment_id: pay.id,
      waybill_id: current.id,
      amount: amount,
      code: current.waybill_code,
      payment_legacy_id: legacyId,
    });
  });
  const checks = allocationChecks(waybills, erp.allocations || [], allocations);
  const paymentChecks = paymentAllocationChecks(erp.payments || [], erp.allocations || [], allocations);
  return { rows: rows, allocations: allocations, checks: checks, paymentChecks: paymentChecks };
}

function matchesExpectedFix(plan) {
  if (!plan) return false;
  const byCode = {};
  (plan.rows || []).forEach(function (row) { byCode[row.code] = row; });
  function same(code, paid, debt, status) {
    const row = byCode[code];
    return !!(row && row.dirty && row.after.paid === paid && row.after.debt === debt && row.after.status === status);
  }
  if (!same('YX-LEG-8', 268000, 190000, 'partial')) return false;
  if (!same('YX-LEG-18', 1500000, 790000, 'partial')) return false;
  if (!same('YX-LEG-19', 0, 916000, 'open')) return false;
  const extra = (plan.rows || []).some(function (row) {
    return row.dirty && row.code !== 'YX-LEG-8' && row.code !== 'YX-LEG-18' && row.code !== 'YX-LEG-19';
  });
  if (extra) return false;
  const allocs = (plan.allocations || []).map(function (row) {
    return row.code + '#' + Number(row.payment_id) + '=' + Number(row.amount);
  }).sort();
  const want = ['YX-LEG-17#25=916000', 'YX-LEG-18#24=1500000', 'YX-LEG-8#23=138000'].sort();
  if (allocs.length !== want.length) return false;
  for (let i = 0; i < want.length; i++) {
    if (allocs[i] !== want[i]) return false;
  }
  return true;
}

function paymentAllocationChecks(payments, existing, added) {
  const sum = {};
  function add(paymentId, amount) {
    const id = String(paymentId);
    sum[id] = (sum[id] || 0) + whole(amount);
  }
  (existing || []).forEach(function (row) { add(row.payment_id, row.amount); });
  (added || []).forEach(function (row) { add(row.payment_id, row.amount); });
  const lines = [];
  let bad = 0;
  (payments || []).forEach(function (pay) {
    if (!pay || pay.legacy_source !== LEGACY_SOURCE) return;
    const got = sum[String(pay.id)] || 0;
    const amount = whole(pay.amount);
    const ok = got === amount;
    if (!ok) bad += 1;
    lines.push({
      id: pay.id,
      sum: got,
      amount: amount,
      ok: ok,
      short: got < amount,
    });
  });
  lines.sort(function (a, b) { return Number(a.id) - Number(b.id); });
  return { lines: lines, bad: bad };
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
  out('--- sum(allocations) <= total (bazadagi + reja) ---');
  const checks = plan.checks || { lines: [], bad: 0 };
  if (!checks.lines.length) out('Tekshiruv uchun legacy yuk xati yo\'q.');
  checks.lines.forEach(function (row) {
    out(
      (row.ok ? 'ok' : 'XATO') + '\t' + row.code +
      '\talloc ' + row.sum + ' <= total ' + row.total
    );
  });
  if (checks.bad) out('XATO: ' + checks.bad + ' yuk xatida allocation jami totaldan oshadi');
  out('--- sum(allocations) = amount (legacy to\'lov) ---');
  const payChecks = plan.paymentChecks || { lines: [], bad: 0 };
  if (!payChecks.lines.length) out('Legacy to\'lov yo\'q.');
  payChecks.lines.forEach(function (row) {
    const mark = row.sum < row.amount ? ' < ' : (row.sum > row.amount ? ' > ' : ' = ');
    out(
      (row.ok ? 'ok' : 'XATO') + '\tpayment #' + row.id +
      '\talloc ' + row.sum + mark + 'amount ' + row.amount
    );
  });
  if (payChecks.bad) out('XATO: ' + payChecks.bad + ' legacy to\'lovda allocation jami amountga teng emas');
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
     WHERE a.waybill_id IN (SELECT id FROM waybills WHERE legacy_source = $1)`,
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
      console.log(matchesExpectedFix(plan) ? 'Reja kutilgan natijaga mos.' : 'MOS EMAS — --apply yozmaydi.');
      return;
    }
    const snap = await erpPool.connect();
    try {
      const erp = await readErpLegacy(snap);
      const plan = buildFixPlan(mini, erp);
      console.log('APPLY — faqat legacy_source=' + LEGACY_SOURCE);
      printFix(plan);
      if (!matchesExpectedFix(plan)) {
        console.error('XATO: reja kutilgan natijaga mos emas. --apply yozilmadi.');
        process.exitCode = 1;
        return;
      }
      await snap.query('SET default_transaction_read_only = off');
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
  matchesExpectedFix: matchesExpectedFix,
  allocationChecks: allocationChecks,
  paymentAllocationChecks: paymentAllocationChecks,
};
