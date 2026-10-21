const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');

const { validateTelegramInitData, signTelegramInitData } = require('../lib/telegram-webapp');
const money = require('../lib/agent-money');
const match = require('../lib/import-match');
const nakladnoy = require('../lib/nakladnoy');
const { createAgentService } = require('../lib/agent-service');
const { createMemoryStore } = require('./memory-agent-store');
const registerAgentRoutes = require('../routes-agent');
const { runImport } = require('../scripts/import-mini-app');

const TOKEN = 'test-bot-token';
const root = path.join(__dirname, '..');

function signed(user, extra) {
  const fields = Object.assign(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'q1',
      user: JSON.stringify(user),
    },
    extra || {}
  );
  return signTelegramInitData(fields, TOKEN);
}

function helpers() {
  let n = 0;
  return {
    tashkentDateStr: function () {
      return '2026-10-21';
    },
    uniqueTmpCode: function (prefix) {
      n += 1;
      return prefix + '-T' + n;
    },
    sendError: function (res, err) {
      const status = err && err.status ? err.status : 500;
      res.status(status).json({ ok: false, error: err && err.message ? err.message : 'xato' });
    },
  };
}

test('telegram initData: valid, tampered, expired, missing token', () => {
  const init = signed({ id: 77, first_name: 'Ali', username: 'ali' });
  const user = validateTelegramInitData(init, TOKEN);
  assert.equal(user.id, 77);
  assert.equal(validateTelegramInitData(init, ''), null);
  assert.equal(validateTelegramInitData(init, 'other'), null);
  const tampered = init.replace('Ali', 'Vali');
  assert.equal(validateTelegramInitData(tampered, TOKEN), null);
  const old = signTelegramInitData(
    {
      auth_date: '100',
      user: JSON.stringify({ id: 1, first_name: 'A' }),
    },
    TOKEN
  );
  assert.equal(validateTelegramInitData(old, TOKEN, { nowSec: 100 + 90000 }), null);
  const future = signTelegramInitData(
    {
      auth_date: String(5_000_000),
      user: JSON.stringify({ id: 1, first_name: 'A' }),
    },
    TOKEN
  );
  assert.equal(validateTelegramInitData(future, TOKEN, { nowSec: 100 }), null);
});

test('waybill totals ignore client totals and cap commission', () => {
  const products = new Map([['5', { id: 5, sku: '1kg', price: 8000, is_active: true }]]);
  const draft = money.buildWaybillDraft(
    {
      items: [{ product_id: 5, quantity: 2, price: 1500, commission: 100, subtotal: 1 }],
      paid_amount: 1000,
      total_amount: 1,
      debt_amount: 0,
    },
    products
  );
  assert.equal(draft.total_amount, 3000);
  assert.equal(draft.paid_amount, 1000);
  assert.equal(draft.debt_amount, 2000);
  assert.equal(draft.items[0].product_name, '1kg');
  assert.throws(() => money.buildWaybillDraft({ items: [], paid_amount: 0 }, products), /bo'sh/);
  assert.throws(
    () =>
      money.buildWaybillDraft(
        { items: [{ product_id: 5, quantity: 1, price: 100, commission: 500 }], paid_amount: 0 },
        products
      ),
    /Komissiya/
  );
});

test('commission share forfeits disabled collections and keeps rounding dust', () => {
  const full = money.commissionOnCollection({
    potential: 100,
    alreadyEarned: 0,
    collected: 300,
    originalTotal: 300,
    allowed: true,
    clearsRemainder: true,
  });
  assert.equal(full, 100);

  const first = money.commissionOnCollection({
    potential: 100,
    alreadyEarned: 0,
    collected: 100,
    originalTotal: 300,
    allowed: true,
    clearsRemainder: false,
  });
  assert.equal(first, 33);
  const last = money.commissionOnCollection({
    potential: 100,
    alreadyEarned: 66,
    collected: 100,
    originalTotal: 300,
    allowed: true,
    clearsRemainder: true,
  });
  assert.equal(last, 34);

  const forfeited = money.commissionOnCollection({
    potential: 100,
    alreadyEarned: 0,
    collected: 40,
    originalTotal: 100,
    allowed: false,
    clearsRemainder: false,
  });
  assert.equal(forfeited, 0);
  const later = money.commissionOnCollection({
    potential: 100,
    alreadyEarned: 0,
    collected: 60,
    originalTotal: 100,
    allowed: true,
    clearsRemainder: true,
  });
  assert.equal(later, 60);

  const dust = money.commissionOnCollection({
    potential: 1,
    alreadyEarned: 0,
    collected: 1,
    originalTotal: 3,
    allowed: true,
    clearsRemainder: true,
  });
  assert.equal(dust, 1);
});

test('debt allocation is FIFO and rejects overpay', () => {
  const open = [
    { id: 2, created_at: '2026-02-01', debt_amount: 50, total_amount: 50, commission_amount: 0, commission_earned: 0 },
    { id: 1, created_at: '2026-01-01', debt_amount: 100, total_amount: 100, commission_amount: 10, commission_earned: 0 },
  ];
  const plan = money.allocateDebtPayment(open, 120, { allowed: true });
  assert.equal(plan.allocations[0].waybill_id, 1);
  assert.equal(plan.allocations[0].amount, 100);
  assert.equal(plan.allocations[0].commission_amount, 10);
  assert.equal(plan.allocations[1].amount, 20);
  const over = money.allocateDebtPayment(open, 1000, { allowed: true });
  assert.match(over.error, /oshib/);
});

test('nakladnoy escapes HTML and emits a PDF', () => {
  const doc = {
    waybill_code: 'YX-1)',
    created_at: '2026-10-21',
    agent_name: 'Ali',
    customer_name: '<script>',
    customer_phone: '90111',
    items: [{ product_name: '1kg', quantity: 1, price: 1000, subtotal: 1000, commission: 50 }],
    total_amount: 1000,
    paid_amount: 0,
    debt_amount: 1000,
    commission_amount: 50,
  };
  const html = nakladnoy.renderNakladnoyHtml(doc);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('&lt;script&gt;'), true);
  assert.match(html, /Yuk xati/);
  const pdf = nakladnoy.renderNakladnoyPdf(doc);
  assert.equal(pdf.slice(0, 5).toString(), '%PDF-');
  assert.equal(pdf.includes('YX-1\\)'), true);
});

test('import plan flags duplicate phones and debt mismatches', () => {
  const mini = {
    profiles: [{ id: 'p1', telegram_id: 5, full_name: 'A' }],
    stores: [
      { id: 's1', owner_id: 'p1', name: "O'ktam", phone: '+998 90 123-45-67' },
      { id: 's2', owner_id: 'p1', name: 'Boshqa', phone: '998901112233' },
    ],
    products: [{ id: 'pr1', owner_id: 'p1', name: '1kg Oddiy' }],
    orders: [
      { id: 9, owner_id: 'p1', store_id: 's1', total_amount: 1000, paid_amount: 200, debt_amount: 1000 },
    ],
    debt_payments: [{ id: 3, owner_id: 'p1', store_id: 's1', amount: 200 }],
    access_requests: [],
  };
  const erp = {
    customers: [{ id: 4, name: 'Oktam', phone: '901234567' }],
    products: [{ id: 8, sku: '1kg Oddiy' }],
  };
  const plan = match.buildImportPlan(mini, erp, {});
  assert.equal(plan.duplicates.some((d) => d.kind === 'erp' && d.reason === 'name+phone'), true);
  assert.equal(plan.counts.skipped_stores, 1);
  const debt = plan.debts.find((d) => d.store_id === 's1');
  assert.equal(debt.needs_review, true);
  assert.equal(debt.stored_minus_reconstructed, 200);
  assert.equal(plan.actions.some((a) => a.type === 'link_product' && a.product_id === 8), true);

  const separate = match.interpretStoreDebt(
    [{ total_amount: 1000, paid_amount: 400, debt_amount: 600 }],
    [{ amount: 100 }]
  );
  assert.equal(separate.interpretation, 'debt_is_unpaid_at_sale_payments_separate');
  assert.equal(separate.applied_to_waybills, false);

  const netted = match.interpretStoreDebt(
    [{ total_amount: 1000, paid_amount: 400, debt_amount: 500 }],
    [{ amount: 100 }]
  );
  assert.equal(netted.interpretation, 'debt_already_includes_payments');
  assert.equal(netted.applied_to_waybills, true);
});

test('apply import writes only inside a transaction and has no deletes', async () => {
  const calls = [];
  let id = 1;
  const erpClient = {
    async query(sql) {
      calls.push(sql);
      if (/RETURNING/i.test(sql)) return { rows: [{ id: id++ }] };
      return { rows: [] };
    },
  };
  const mini = {
    profiles: [{ id: 'p1', telegram_id: 5, full_name: 'Agent', access_status: 'approved' }],
    stores: [{ id: 's1', owner_id: 'p1', name: 'Do\'kon', phone: '901112233' }],
    products: [],
    orders: [{ id: 7, owner_id: 'p1', store_id: 's1', total_amount: 500, paid_amount: 0, debt_amount: 500 }],
    order_items: [{ id: 1, order_id: 7, product_name: '1kg', quantity: 1, price: 500, subtotal: 500, commission: 20 }],
    debt_payments: [{ id: 2, owner_id: 'p1', store_id: 's1', amount: 100 }],
    commission_events: [{ id: 3, owner_id: 'p1', store_id: 's1', order_id: 7, amount: 20, source: 'order' }],
    commission_withdrawals: [{ id: 4, owner_id: 'p1', amount: 5, notes: 'naqd' }],
    access_requests: [],
  };
  const logs = [];
  const dry = await runImport({
    apply: false,
    mini: mini,
    erp: { customers: [], products: [] },
    links: {},
    log: (line) => logs.push(line),
  });
  assert.equal(dry.wrote, false);
  assert.equal(calls.length, 0);
  assert.match(logs[0], /DRY-RUN/);

  calls.length = 0;
  const applied = await runImport({
    apply: true,
    mini: mini,
    erp: { customers: [], products: [] },
    links: {},
    erpClient: erpClient,
    log: () => {},
  });
  assert.equal(applied.wrote, true);
  const blob = calls.join('\n');
  assert.match(blob, /^BEGIN/);
  assert.match(blob, /COMMIT/);
  assert.doesNotMatch(blob, /\bDELETE\b/i);
  assert.doesNotMatch(blob, /\bDROP\b/i);
  assert.doesNotMatch(blob, /\bTRUNCATE\b/i);
  assert.match(blob, /INSERT INTO agents/);
  assert.match(blob, /INSERT INTO waybills/);
  assert.match(blob, /INSERT INTO customer_map/);
});

test('migration is additive', () => {
  const sqlRaw = fs.readFileSync(path.join(root, 'migrations/004_agent_field_sales.sql'), 'utf8');
  const sql = sqlRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agents/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS waybills/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS waybill_items/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_access_requests/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_debt_payments/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_commission_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_commission_withdrawals/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS customer_map/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_map/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS agent_id/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS latitude/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS longitude/);
  assert.match(sql, /legacy_source/);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+COLUMN\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bRENAME\b/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS agents/);
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /AGENT_CORS_ORIGINS/);
  assert.match(server, /\/api\/agent\/admin/);
  assert.match(server, /routes-agent/);
});

test('service scopes customers, computes money, and blocks over-withdrawal', async () => {
  const seeded = createMemoryStore();
  // products are internal. Recreate store from a small extension: call insert by
  // temporarily using the fact createMemoryStore returns api that can be primed
  const catalog = [{ id: 5, sku: '1kg Oddiy', price: 8000, is_active: true, weight_kg: 1 }];
  seeded.getActiveProductsByIds = async function (ids) {
    const want = (ids || []).map(String);
    return catalog.filter((p) => want.indexOf(String(p.id)) !== -1 && p.is_active !== false);
  };
  seeded.listActiveProducts = async function () {
    return catalog.map((p) => ({ id: p.id, sku: p.sku, price: p.price, weight_kg: p.weight_kg }));
  };
  const service = createAgentService(seeded, helpers());

  const tg = { id: 77, first_name: 'Ali', username: 'ali' };
  const requested = await service.requestAccess(tg, { full_name: 'Ali Vali' });
  const approved = await service.adminApprove(requested.request.id, 'Dono', null);
  assert.equal(approved.agent.access_status, 'approved');

  const otherReq = await service.requestAccess({ id: 88, first_name: 'B' }, { full_name: 'B' });
  await service.adminApprove(otherReq.request.id, 'Dono', null);

  const customer = await service.createCustomer(approved.agent.id, {
    name: 'Do\'kon',
    phone: '901112233',
    lat: 41.31,
    lng: 69.24,
  });
  assert.equal(customer.latitude, 41.31);
  assert.equal(customer.agent_id, approved.agent.id);

  const hidden = await service.listCustomers(otherReq.request ? (await service.getMe({ id: 88, first_name: 'B' })).agent.id : 0);
  assert.equal(hidden.length, 0);
  await assert.rejects(() => service.getCustomer(hidden && 999, customer.id), /topilmadi/);

  const waybill = await service.createWaybill(approved.agent, {
    customer_id: customer.id,
    paid_amount: 0,
    total_amount: 1,
    items: [{ product_id: 5, quantity: 3, price: 100, commission: 100, subtotal: 1 }],
  });
  assert.equal(Number(waybill.total_amount), 300);
  assert.equal(Number(waybill.debt_amount), 300);
  assert.equal(waybill.commission_earned_now, 0);

  const pay = await service.collectDebt(approved.agent, { customer_id: customer.id, amount: 100, notes: 'naqd' });
  assert.equal(pay.allocations[0].amount, 100);
  assert.equal(pay.allocations[0].commission_amount, 33);

  const again = await service.collectDebt(approved.agent, { customer_id: customer.id, amount: 200 });
  assert.equal(again.allocations[0].commission_amount, 67);
  const snap = await service.commission(approved.agent.id);
  assert.equal(snap.earned, 100);
  assert.equal(snap.balance, 100);

  const taken = await service.withdraw(approved.agent.id, { amount: 40, notes: 'yechish' });
  assert.equal(taken.balance, 60);
  await assert.rejects(() => service.withdraw(approved.agent.id, { amount: 1000 }), /yetarli emas/);
  const after = await service.commission(approved.agent.id);
  assert.equal(after.balance, 60);

  await assert.rejects(
    () => service.collectDebt(approved.agent, { customer_id: customer.id, amount: 1 }),
    /oshib/
  );

  const off = await service.deactivateCustomer(approved.agent.id, customer.id);
  assert.equal(off.is_active, false);
  const still = await service.getCustomer(approved.agent.id, customer.id);
  assert.equal(still.is_active, false);

  const bAgent = (await service.getMe({ id: 88, first_name: 'B' })).agent;
  await assert.rejects(() => service.getWaybill(bAgent.id, waybill.id), /topilmadi/);
});

test('disabled commission does not earn on the unpaid share later', async () => {
  const seeded = createMemoryStore();
  const catalog = [{ id: 1, sku: '2kg', price: 100, is_active: true }];
  seeded.getActiveProductsByIds = async function (ids) {
    return catalog.filter((p) => (ids || []).map(String).indexOf(String(p.id)) !== -1);
  };
  const service = createAgentService(seeded, helpers());
  const req = await service.requestAccess({ id: 5, first_name: 'C' }, { full_name: 'C' });
  const approved = await service.adminApprove(req.request.id, 'Dono', '2099-01-01');
  const agent = approved.agent;
  const customer = await service.createCustomer(agent.id, { name: 'M' });
  const waybill = await service.createWaybill(agent, {
    customer_id: customer.id,
    paid_amount: 40,
    items: [{ product_id: 1, quantity: 1, price: 100, commission: 100 }],
  });
  assert.equal(waybill.commission_earned_now, 0);
  assert.equal(Number(waybill.debt_amount), 60);
  agent.commission_enabled_on = null;
  const pay = await service.collectDebt(agent, { customer_id: customer.id, amount: 60 });
  assert.equal(pay.allocations[0].commission_amount, 60);
  const snap = await service.commission(agent.id);
  assert.equal(snap.earned, 60);
});

test('HTTP auth, admin key, and server-side total', async () => {
  const seeded = createMemoryStore();
  const catalog = [{ id: 3, sku: '1kg', price: 5000, is_active: true }];
  seeded.getActiveProductsByIds = async (ids) =>
    catalog.filter((p) => (ids || []).map(String).includes(String(p.id)));
  seeded.listActiveProducts = async () => catalog;
  const app = express();
  app.use(express.json());
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevKey = process.env.ADMIN_KEY;
  const prevNode = process.env.NODE_ENV;
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.ADMIN_KEY = 'secret-admin';
  process.env.NODE_ENV = 'test';
  registerAgentRoutes(app, null, helpers(), { store: seeded });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(urlPath, opts) {
    const res = await fetch(base + urlPath, {
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {}),
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { raw: text };
    }
    return { status: res.status, data: data, text: text };
  }
  try {
    const missing = await call('/api/agent/me');
    assert.equal(missing.status, 503);
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    const bad = await call('/api/agent/me', { headers: { 'x-telegram-init-data': 'hash=ab' } });
    assert.equal(bad.status, 401);
    const init = signed({ id: 42, first_name: 'Zara', username: 'zara' });
    const me = await call('/api/agent/me', { headers: { 'x-telegram-init-data': init } });
    assert.equal(me.status, 200);
    assert.equal(me.data.data.agent, null);
    const closed = await call('/api/agent/products', { headers: { 'x-telegram-init-data': init } });
    assert.equal(closed.status, 403);
    const noKey = await call('/api/agent/admin/agents');
    assert.equal(noKey.status, 401);
    const asked = await call('/api/agent/access-requests', {
      method: 'POST',
      headers: { 'x-telegram-init-data': init },
      body: { full_name: 'Zara' },
    });
    assert.equal(asked.status, 200);
    const approved = await call('/api/agent/admin/access-requests/' + asked.data.data.request.id + '/approve', {
      method: 'POST',
      headers: { 'x-admin-key': 'secret-admin', 'x-operator-name': 'Dono' },
      body: {},
    });
    assert.equal(approved.status, 200);
    const created = await call('/api/agent/customers', {
      method: 'POST',
      headers: { 'x-telegram-init-data': init },
      body: { name: 'Zara do\'kon' },
    });
    assert.equal(created.status, 201);
    const bill = await call('/api/agent/waybills', {
      method: 'POST',
      headers: { 'x-telegram-init-data': init },
      body: {
        customer_id: created.data.data.id,
        paid_amount: 500,
        total_amount: 1,
        items: [{ product_id: 3, quantity: 2, price: 1000, commission: 0, subtotal: 1 }],
      },
    });
    assert.equal(bill.status, 201);
    assert.equal(Number(bill.data.data.total_amount), 2000);
    assert.equal(Number(bill.data.data.debt_amount), 1500);
    const html = await call('/api/agent/waybills/' + bill.data.data.id + '/nakladnoy', {
      headers: { 'x-telegram-init-data': init },
    });
    assert.equal(html.status, 200);
    assert.match(html.text, /Yuk xati/);
    const pdf = await fetch(base + '/api/agent/waybills/' + bill.data.data.id + '/nakladnoy.pdf', {
      headers: { 'x-telegram-init-data': init },
    });
    const buf = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdf.status, 200);
    assert.equal(buf.slice(0, 5).toString(), '%PDF-');
  } finally {
    server.close();
    if (prevToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevKey == null) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = prevKey;
    if (prevNode == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
});
