const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');

const money = require('../lib/agent-money');
const { createYukService } = require('../lib/yuk-service');
const { createMemoryStore } = require('./memory-agent-store');
const { signTelegramInitData } = require('../lib/telegram-webapp');
const { authenticateOwner, ownerInitDataMaxAge } = require('../lib/admin-auth');
const registerAgentRoutes = require('../routes-agent');

const TOKEN = 'test-bot-token';
const root = path.join(__dirname, '..');

function signed(user, authDate) {
  return signTelegramInitData(
    {
      auth_date: String(authDate == null ? Math.floor(Date.now() / 1000) : authDate),
      query_id: 'q1',
      user: JSON.stringify(user),
    },
    TOKEN
  );
}

function helpers() {
  return {
    tashkentDateStr: function () { return '2026-10-21'; },
    sendError: function (res, err) {
      const status = err && err.status ? err.status : 500;
      res.status(status).json({ ok: false, error: err && err.message ? err.message : 'xato' });
    },
  };
}

async function shop() {
  const store = createMemoryStore();
  await store.insertProduct({ id: 5, sku: '1kg Oddiy', price: 8000, is_active: true });
  store.settings.company_name = 'Briket';
  store.settings.company_card = '';
  store.settings.company_phone = '998900000000';
  const service = createYukService(store, helpers());
  const customer = await service.createCustomer({ name: 'Chorsu', phone: '901112233', address: 'Bozor' });
  return { store: store, service: service, customer: customer };
}

test('allocation follows sale_date then id, never created_at', () => {
  const open = [
    { id: 2, sale_date: '2026-09-01', created_at: '2020-01-01', debt_amount: 100, total_amount: 100 },
    { id: 1, sale_date: '2026-08-01', created_at: '2026-10-20', debt_amount: 40, total_amount: 40 },
  ];
  const plan = money.allocateBySaleDate(open, 50);
  assert.equal(plan.allocations[0].waybill_id, 1);
  assert.equal(plan.allocations[0].amount, 40);
  assert.equal(plan.allocations[1].waybill_id, 2);
  assert.equal(plan.allocations[1].amount, 10);
  assert.equal(plan.credit, 0);
  open[0].created_at = '1999-01-01';
  open[1].created_at = '2099-01-01';
  const again = money.allocateBySaleDate(open, 50);
  assert.equal(again.allocations[0].waybill_id, 1);
  const over = money.allocateBySaleDate(open, 1000);
  assert.equal(over.applied, 140);
  assert.equal(over.credit, 860);
  const agent = money.allocateDebtPayment(open, 1000, { allowed: true });
  assert.match(agent.error, /oshib/);
});

test('owner draft ignores client totals and requires whole som', () => {
  const products = new Map([['5', { id: 5, sku: '1kg', price: '8000.00', is_active: true }]]);
  const draft = money.buildOwnerDraft(
    {
      items: [{ product_id: 5, quantity: 2, price: 1500, subtotal: 1 }],
      total_amount: 1,
      paid_amount: 99999,
      debt_amount: 0,
    },
    products
  );
  assert.equal(draft.total_amount, 3000);
  assert.equal(draft.items[0].subtotal, 3000);
  assert.throws(() => money.buildOwnerDraft({ items: [{ product_id: 5, quantity: 1.5, price: 100 }] }, products), /butun/);
  assert.throws(
    () => money.buildOwnerDraft({ items: [{ product_id: 5, quantity: 1, price: 0 }] }, products),
    /Narx 0/
  );
  const zero = money.buildOwnerDraft(
    { items: [{ product_id: 5, quantity: 1, price: 0 }], confirm_zero_price: true },
    products
  );
  assert.equal(zero.total_amount, 0);
});

test('sale date window and due date use Tashkent calendar days', () => {
  const today = '2026-10-21';
  assert.equal(money.assertSaleDate(today, today), today);
  assert.equal(money.assertSaleDate(money.addDaysYmd(today, -90), today), '2026-07-23');
  assert.throws(() => money.assertSaleDate('2026-10-22', today), /kelajak/);
  assert.throws(() => money.assertSaleDate('2026-07-22', today), /90 kun/);
  assert.throws(() => money.assertDueDate('2026-10-20', '2026-10-21', 10), /oldin/);
  assert.throws(() => money.assertDueDate('', '2026-10-21', 10), /muddat/i);
  assert.equal(money.assertDueDate(null, '2026-10-21', 0), null);
  assert.equal(money.formatDmy('2026-10-21'), '21.10.2026');
  const evening = money.tashkentToday(new Date('2026-10-21T20:30:00Z'));
  assert.equal(evening, '2026-10-22');
});

test('sale money is allocations, idempotent, and locks the customer first', async () => {
  const ctx = await shop();
  let lockedBefore = false;
  const orig = ctx.store.lockOwnerCustomer;
  ctx.store.lockOwnerCustomer = async function (id) {
    lockedBefore = ctx.store.ledger.length === 0;
    return orig(id);
  };
  const body = {
    request_id: 'req-sale-0001',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-21',
    naqd: 500,
    karta: 200,
    items: [{ product_id: 5, quantity: 2, price: 1000, subtotal: 1, total_amount: 5 }],
    due_date: '2026-10-25',
  };
  const first = await ctx.service.createSale(body);
  assert.equal(lockedBefore, true);
  assert.equal(first.total_amount, 2000);
  assert.equal(first.paid_amount, 700);
  assert.equal(first.debt_amount, 1300);
  assert.equal(first.paid_cash, 500);
  assert.equal(first.paid_card, 200);
  assert.equal(ctx.store.ledger.length, 2);
  assert.equal(ctx.store.ledger.reduce((s, p) => s + Number(p.amount), 0), 700);
  const alloc = ctx.store.ledgerAlloc.reduce((s, a) => s + Number(a.amount), 0);
  assert.equal(alloc, 700);
  assert.equal(first.paid_amount, alloc);
  const again = await ctx.service.createSale(body);
  assert.equal(again.replay, true);
  assert.equal(again.id, first.id);
  assert.equal(ctx.store.waybills.length, 1);
  assert.equal(ctx.store.ledger.length, 2);
  assert.match(first.waybill_code, /^YX-20261021-\d{6}$/);
  assert.match(first.text, /21\.10\.2026/);
  assert.match(first.text, /Naqd: 500/);
});

test('overpayment fills oldest open waybill then store credit', async () => {
  const ctx = await shop();
  await ctx.service.createSale({
    request_id: 'req-old-sale1',
    customer_id: ctx.customer.id,
    sale_date: '2026-08-01',
    naqd: 0,
    karta: 0,
    due_date: '2026-08-10',
    items: [{ product_id: 5, quantity: 1, price: 300 }],
  });
  const fresh = await ctx.service.createSale({
    request_id: 'req-new-sale1',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-21',
    naqd: 700,
    karta: 0,
    items: [{ product_id: 5, quantity: 1, price: 500 }],
  });
  assert.equal(fresh.paid_amount, 500);
  assert.equal(fresh.debt_amount, 0);
  assert.equal(fresh.credit_written, 0);
  const rows = await ctx.store.listOwnerWaybills(ctx.customer.id);
  const older = rows.find((w) => String(w.sale_date).slice(0, 10) === '2026-08-01');
  assert.equal(older.paid_amount, 200);
  assert.equal(older.debt_amount, 100);
  const creditSale = await ctx.service.createSale({
    request_id: 'req-credit-01',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-20',
    naqd: 1100,
    karta: 0,
    items: [{ product_id: 5, quantity: 1, price: 1000 }],
  });
  assert.equal(creditSale.paid_amount, 1000);
  assert.equal(creditSale.debt_amount, 0);
  const olderAfter = (await ctx.store.listOwnerWaybills(ctx.customer.id))
    .find((w) => String(w.sale_date).slice(0, 10) === '2026-08-01');
  assert.equal(olderAfter.debt_amount, 0);
  assert.equal(olderAfter.paid_amount, 300);
  assert.equal(await ctx.store.storeCreditBalance(ctx.customer.id), 0);
});

test('editing a paid waybill keeps the money as older debt or store credit', async () => {
  const ctx = await shop();
  await ctx.store.insertLegacyWaybill({
    customer_id: ctx.customer.id,
    waybill_code: 'YX-LEG-1',
    sale_date: '2026-08-02',
    total_amount: 1000,
    paid_amount: 700,
    debt_amount: 300,
    due_date: '2026-08-20',
    stock_posted: false,
    legacy_source: 'briket-mini-app',
    items: [{ product_name: '1kg', quantity: 1, price: 1000, subtotal: 1000 }],
  });
  const shown = await ctx.service.customerDetail(ctx.customer.id);
  const legacy = shown.waybills.find((w) => w.legacy_source);
  assert.equal(legacy.paid_amount, 700);
  assert.equal(legacy.debt_amount, 300);
  assert.equal(legacy.stock_posted, false);
  const paid = await ctx.service.createSale({
    request_id: 'req-paid-full',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-21',
    naqd: 1000,
    karta: 0,
    items: [{ product_id: 5, quantity: 1, price: 1000 }],
  });
  await assert.rejects(
    () => ctx.service.editSale(paid.id, { paid_amount: 0, items: [{ product_id: 5, quantity: 1, price: 400 }] }),
    /tahrirlanmaydi/
  );
  const edited = await ctx.service.editSale(paid.id, {
    items: [{ product_id: 5, quantity: 1, price: 400 }],
    sale_date: '2026-10-21',
  });
  assert.equal(edited.total_amount, 400);
  assert.equal(edited.paid_amount, 400);
  assert.equal(edited.debt_amount, 0);
  const legacyAfter = (await ctx.store.listOwnerWaybills(ctx.customer.id)).find((w) => w.legacy_source);
  assert.equal(legacyAfter.paid_amount, 1000);
  assert.equal(legacyAfter.debt_amount, 0);
  assert.equal(await ctx.store.storeCreditBalance(ctx.customer.id), 300);
  assert.ok(ctx.store.ledger.some((p) => p.kind === 'reallocation'));
  assert.equal(ctx.store.ledger.some((p) => p.kind === 'collection' && Number(p.amount) === 1000), true);
});

test('debt payment starts from the amount given and reversal is a correction', async () => {
  const ctx = await shop();
  await ctx.service.createSale({
    request_id: 'req-open-debt',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-21',
    naqd: 0,
    karta: 0,
    due_date: '2026-10-21',
    items: [{ product_id: 5, quantity: 1, price: 1000 }],
  });
  const pay = await ctx.service.collectPayment(ctx.customer.id, {
    request_id: 'req-pay-0001',
    amount: 400,
    method: 'card',
  });
  assert.equal(pay.debt_amount, 600);
  const before = ctx.store.ledger.length;
  const rev = await ctx.service.reversePayment(pay.payment.id, { request_id: 'req-rev-0001' });
  assert.equal(rev.deleted, false);
  assert.equal(ctx.store.ledger.length, before + 1);
  assert.ok(ctx.store.ledger.find((p) => p.id === pay.payment.id));
  const bill = (await ctx.store.listOwnerWaybills(ctx.customer.id))[0];
  assert.equal(bill.paid_amount, 0);
  assert.equal(bill.debt_amount, 1000);
  await assert.rejects(
    () => ctx.service.reversePayment(pay.payment.id, { request_id: 'req-rev-0002' }),
    /tuzatilgan/
  );
  assert.equal(ctx.store.ledger.length, before + 1);
});

test('owner auth rejects an empty allow-list, stale initData, and other roles', async () => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevIds = process.env.ADMIN_TELEGRAM_IDS;
  const prevAge = process.env.TELEGRAM_INITDATA_MAX_AGE_SEC;
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_INITDATA_MAX_AGE_SEC = '86400';
  delete process.env.ADMIN_TELEGRAM_IDS;
  assert.equal(ownerInitDataMaxAge(), 3600);
  const empty = authenticateOwner(signed({ id: 1001, first_name: 'Ega' }));
  assert.equal(empty.ok, false);
  assert.equal(empty.status, 401);
  assert.match(empty.error, /ADMIN_TELEGRAM_IDS/);

  process.env.ADMIN_TELEGRAM_IDS = '1001';
  const now = Math.floor(Date.now() / 1000);
  const stale = authenticateOwner(signed({ id: 1001, first_name: 'Ega' }, now - 3700), now);
  assert.equal(stale.status, 401);
  const stranger = authenticateOwner(signed({ id: 999, first_name: 'Begona' }, now), now);
  assert.equal(stranger.status, 403);
  const ok = authenticateOwner(signed({ id: 1001, first_name: 'Ega' }, now - 100), now);
  assert.equal(ok.ok, true);
  assert.equal(ok.role, 'owner');

  const { store, customer } = await shop();
  await store.insertCustomer
    ? null
    : null;
  const agentCustomer = {
    id: 77,
    name: 'Agent do\'koni',
    agent_id: 4,
    is_active: true,
    phone: '900000001',
  };
  store.customers = store.customers || [];
  const seeded = createMemoryStore();
  await seeded.insertProduct({ id: 5, sku: '1kg Oddiy', price: 1000, is_active: true });
  const service = createYukService(seeded, helpers());
  const mine = await service.createCustomer({ name: 'Mening' });
  seeded.customers.push(agentCustomer);
  seeded.waybills.push({
    id: 900,
    waybill_code: 'YX-AGENT',
    agent_id: 4,
    customer_id: 77,
    total_amount: 500,
    paid_amount: 0,
    debt_amount: 500,
    sale_date: '2026-10-21',
    due_date: '2026-10-21',
    status: 'open',
  });
  const list = await service.listCustomers('');
  assert.equal(list.some((c) => c.agent_id != null), false);
  assert.equal(list.some((c) => c.name === 'Mening'), true);
  await assert.rejects(() => service.customerDetail(77), /topilmadi/);
  await assert.rejects(() => service.waybillText(900), /topilmadi/);

  const app = express();
  app.use(express.json());
  registerAgentRoutes(app, null, helpers(), { store: seeded });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    delete process.env.ADMIN_TELEGRAM_IDS;
    const denied = await fetch(base + '/api/agent/yuk/me', {
      headers: { 'x-telegram-init-data': signed({ id: 1001, first_name: 'Ega' }, now) },
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 401);
    assert.match(deniedBody.error, /ADMIN_TELEGRAM_IDS/);
    process.env.ADMIN_TELEGRAM_IDS = '1001';
    const old = await fetch(base + '/api/agent/yuk/customers', {
      headers: { 'x-telegram-init-data': signed({ id: 1001, first_name: 'Ega' }, now - 4000) },
    });
    assert.equal(old.status, 401);
    const good = await fetch(base + '/api/agent/yuk/me', {
      headers: { 'x-telegram-init-data': signed({ id: 1001, first_name: 'Ega' }, now) },
    });
    const me = await good.json();
    assert.equal(good.status, 200);
    assert.equal(me.data.role, 'owner');
    assert.equal(me.data.telegram_id, '1001');
    const rows = await fetch(base + '/api/agent/yuk/customers', {
      headers: { 'x-telegram-init-data': signed({ id: 1001, first_name: 'Ega' }, now) },
    });
    const data = await rows.json();
    assert.equal(data.data.some((c) => String(c.id) === '77'), false);
    assert.equal(data.data.some((c) => c.id === mine.id), true);
  } finally {
    server.close();
    if (prevToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevIds == null) delete process.env.ADMIN_TELEGRAM_IDS;
    else process.env.ADMIN_TELEGRAM_IDS = prevIds;
    if (prevAge == null) delete process.env.TELEGRAM_INITDATA_MAX_AGE_SEC;
    else process.env.TELEGRAM_INITDATA_MAX_AGE_SEC = prevAge;
  }
  void customer;
});

test('yuk migration is additive and the page does not hardcode an owner id', () => {
  const sqlRaw = fs.readFileSync(path.join(root, 'migrations/007_yuk_xati.sql'), 'utf8');
  const sql = sqlRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sale_date/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS request_id/);
  assert.match(sql, /waybill_code_seq/);
  assert.match(sql, /payment_allocations/);
  assert.match(sql, /store_credits/);
  assert.match(sql, /company_card/);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bRENAME\b/i);
  const page = fs.readFileSync(path.join(root, 'public/yuk.html'), 'utf8');
  assert.match(page, /Sotuv/);
  assert.match(page, /Do'konlar/);
  assert.match(page, /Eslatma/);
  assert.match(page, /Sozlama/);
  assert.match(page, /Saqlash va yuk xati/);
  assert.doesNotMatch(page, /8600\s*\d{4}/);
  assert.doesNotMatch(page, /ADMIN_TELEGRAM_IDS\s*=\s*['"]\d+/);
  const queries = fs.readFileSync(path.join(root, 'lib/yuk-sql.js'), 'utf8');
  assert.match(queries, /FOR UPDATE/);
  assert.match(queries, /agent_id IS NULL/);
  assert.match(queries, /sale_date ASC NULLS LAST, id ASC/);
  assert.doesNotMatch(queries, /ORDER BY[^;\n]*created_at/i);
});

test('reminders group by Tashkent due dates and legacy rows stay visible', async () => {
  const ctx = await shop();
  await ctx.store.insertLegacyWaybill({
    customer_id: ctx.customer.id,
    sale_date: '2026-10-01',
    due_date: '2026-10-20',
    total_amount: 500,
    paid_amount: 100,
    debt_amount: 400,
    stock_posted: false,
    items: [{ product_name: 'Eski', quantity: 1, price: 500, subtotal: 500 }],
  });
  await ctx.service.createSale({
    request_id: 'req-due-today',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-21',
    naqd: 0,
    karta: 0,
    due_date: '2026-10-21',
    items: [{ product_id: 5, quantity: 1, price: 100 }],
  });
  await ctx.service.createSale({
    request_id: 'req-due-tomor',
    customer_id: ctx.customer.id,
    sale_date: '2026-10-21',
    naqd: 0,
    karta: 0,
    due_date: '2026-10-22',
    items: [{ product_id: 5, quantity: 1, price: 100 }],
  });
  const groups = await ctx.service.reminders();
  assert.equal(groups.groups.overdue.length, 1);
  assert.equal(groups.groups.overdue[0].debt_amount, 400);
  assert.equal(groups.groups.today.length, 1);
  assert.equal(groups.groups.tomorrow.length, 1);
  const boot = await ctx.service.bootstrap();
  assert.equal(boot.today, '2026-10-21');
  assert.equal(boot.company.card, '');
  assert.equal(boot.company.phone, '998900000000');
  assert.equal(boot.products[0].price, 8000);
});
