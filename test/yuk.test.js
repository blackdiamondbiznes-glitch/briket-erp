const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');

const money = require('../lib/agent-money');
const { createYukService } = require('../lib/yuk-service');
const { createMemoryStore } = require('./memory-agent-store');
const { signTelegramInitData } = require('../lib/telegram-webapp');
const { creatorFromUser, creatorLabel } = require('../lib/yuk-creator');
const { authenticateOwner, ownerInitDataMaxAge } = require('../lib/admin-auth');
const { checkTelegramInitData } = require('../lib/telegram-webapp');
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
  assert.equal(stale.reason, 'expired');
  assert.match(stale.error, /eskirgan/);
  const missing = authenticateOwner('');
  assert.equal(missing.reason, 'missing');
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
    const oldBody = await old.json();
    assert.equal(old.status, 401);
    assert.equal(oldBody.reason, 'expired');
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

test('initData keeps signature in the check string and names the failure', () => {
  const now = 1733509682;
  const official = 'user=%7B%22id%22%3A279058397%2C%22first_name%22%3A%22Vladislav%20%2B%20-%20%3F%20%5C%2F%22%2C%22last_name%22%3A%22Kibenko%22%2C%22username%22%3A%22vdkfrost%22%2C%22language_code%22%3A%22ru%22%2C%22is_premium%22%3Atrue%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2F4FPEE4tmP3ATHa57u6MqTDih13LTOiMoKoLDRG4PnSA.svg%22%7D&chat_instance=8134722200314281151&chat_type=private&auth_date=1733509682&signature=TYJxVcisqbWjtodPepiJ6ghziUL94-KNpG8Pau-X7oNNLNBM72APCpi_RKiUlBvcqo5L-LAxIc3dnTzcZX_PDg&hash=a433d8f9847bd6addcc563bff7cc82c89e97ea0d90c11fe5729cae6796a36d73';
  const token = '7342037359:AAHI25ES9xCOMPokpYoz-p8XVrZUdygo2J4';
  const ok = checkTelegramInitData(official, ' \n' + token + '\n ', { nowSec: now, maxAgeSec: 3600 });
  assert.equal(ok.reason, 'ok');
  assert.equal(ok.user.id, 279058397);
  assert.equal(ok.user.first_name, 'Vladislav + - ? /');
  const stripped = official.replace(/&signature=[^&]+/, '');
  assert.equal(checkTelegramInitData(stripped, token, { nowSec: now, maxAgeSec: 3600 }).reason, 'hash_mismatch');
  const signedWithSig = signTelegramInitData(
    {
      auth_date: String(now),
      signature: 'TYJxVcisqbWjtodPepiJ6ghziUL94-KNpG8Pau-X7oNNLNBM72APCpi_RKiUlBvcqo5L-LAxIc3dnTzcZX_PDg',
      user: JSON.stringify({ id: 5052443384, first_name: 'Ega' }),
    },
    TOKEN
  );
  assert.match(signedWithSig, /(?:^|&)signature=/);
  assert.equal(checkTelegramInitData(signedWithSig, TOKEN, { nowSec: now }).user.id, 5052443384);
  const millis = signTelegramInitData(
    {
      auth_date: String(now * 1000),
      user: JSON.stringify({ id: 7, first_name: 'Ega' }),
    },
    TOKEN
  );
  assert.equal(checkTelegramInitData(millis, TOKEN, { nowSec: now, maxAgeSec: 3600 }).reason, 'ok');
  assert.equal(checkTelegramInitData('', TOKEN).reason, 'missing');
  assert.equal(checkTelegramInitData(official, token, { nowSec: now + 4000, maxAgeSec: 3600 }).reason, 'expired');
  assert.equal(checkTelegramInitData('x'.repeat(17000), TOKEN).reason, 'too_long');
  const src = fs.readFileSync(path.join(root, 'lib/telegram-webapp.js'), 'utf8');
  assert.doesNotMatch(src, /delete\(['"]signature['"]\)/);
  assert.match(src, /HMAC_SHA256|createHmac\('sha256', 'WebAppData'\)/);
});

test('yuk accepts initData from the query string or JSON body, not only the header', async () => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevIds = process.env.ADMIN_TELEGRAM_IDS;
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.ADMIN_TELEGRAM_IDS = '1001';
  const now = Math.floor(Date.now() / 1000);
  const init = signTelegramInitData(
    {
      auth_date: String(now),
      signature: 'abcDEF_signature-value',
      user: JSON.stringify({ id: 1001, first_name: 'Ega' }),
    },
    TOKEN
  );
  const store = createMemoryStore();
  const app = express();
  app.use(express.json());
  registerAgentRoutes(app, null, helpers(), { store: store });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const viaQuery = await fetch(base + '/api/agent/yuk/me?init_data=' + encodeURIComponent(init));
    const queryBody = await viaQuery.json();
    assert.equal(viaQuery.status, 200);
    assert.equal(queryBody.data.telegram_id, '1001');
    const viaAuth = await fetch(base + '/api/agent/yuk/bootstrap', {
      headers: { Authorization: 'tma ' + init },
    });
    const boot = await viaAuth.json();
    assert.equal(viaAuth.status, 200);
    assert.equal(boot.data.role, 'owner');
    const viaBody = await fetch(base + '/api/agent/yuk/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: init, name: 'Yangi do\'kon' }),
    });
    const created = await viaBody.json();
    assert.equal(viaBody.status, 201);
    assert.equal(created.data.name, 'Yangi do\'kon');
    const bad = await fetch(base + '/api/agent/yuk/me');
    const badBody = await bad.json();
    assert.equal(bad.status, 401);
    assert.equal(badBody.reason, 'missing');
    assert.match(badBody.error, /yo'q/);
  } finally {
    server.close();
    if (prevToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevIds == null) delete process.env.ADMIN_TELEGRAM_IDS;
    else process.env.ADMIN_TELEGRAM_IDS = prevIds;
  }
});

test('two admins are stored on the yuk xati and the payment', async () => {
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevIds = process.env.ADMIN_TELEGRAM_IDS;
  const prevKey = process.env.ADMIN_KEY;
  const prevNode = process.env.NODE_ENV;
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.ADMIN_TELEGRAM_IDS = '1001,1002';
  process.env.ADMIN_KEY = 'secret-admin';
  process.env.NODE_ENV = 'test';
  const now = Math.floor(Date.now() / 1000);
  function initFor(user) {
    return signTelegramInitData({
      auth_date: String(now),
      user: JSON.stringify(user),
    }, TOKEN);
  }
  const aka = initFor({ id: 1001, first_name: 'Aka', last_name: 'Karimov', username: 'aka' });
  const ota = initFor({ id: 1002, first_name: 'Ota', username: 'ota' });
  const store = createMemoryStore();
  await store.insertProduct({ id: 5, sku: '1kg', price: 1000, is_active: true });
  const app = express();
  app.use(express.json());
  registerAgentRoutes(app, null, helpers(), { store: store });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  function call(urlPath, init, body) {
    return fetch(base + urlPath, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign(
        { 'x-telegram-init-data': init },
        body ? { 'Content-Type': 'application/json' } : {}
      ),
      body: body ? JSON.stringify(body) : undefined,
    }).then(async function (res) {
      return { status: res.status, data: await res.json() };
    });
  }
  try {
    const onlyName = creatorFromUser({ id: 3, username: '@aka' });
    assert.equal(creatorLabel({ created_by_username: onlyName.username }), '@aka');
    assert.equal(creatorFromUser({ id: 'abc' }), null);
    assert.equal(creatorLabel({}), 'Eski yozuv');

    const customer = await call('/api/agent/yuk/customers', aka, { name: 'Chorsu' });
    assert.equal(customer.status, 201);
    const sale = await call('/api/agent/yuk/waybills', aka, {
      request_id: 'req-aka-0001',
      customer_id: customer.data.data.id,
      sale_date: '2026-10-21',
      naqd: 200,
      karta: 0,
      due_date: '2026-10-28',
      items: [{ product_id: 5, quantity: 1, price: 1000 }],
      created_by_first_name: 'Boshqa',
      created_by_telegram_id: '9',
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.data.data.created_by_name, 'Aka Karimov');
    assert.equal(sale.data.data.created_by_telegram_id, '1001');
    assert.equal(sale.data.data.created_by_username, 'aka');
    assert.match(sale.data.data.text, /Yozgan: Aka Karimov/);
    assert.equal(store.ledger[0].created_by_telegram_id, '1001');
    assert.equal(store.ledger[0].created_by_first_name, 'Aka');

    const pay = await call('/api/agent/yuk/customers/' + customer.data.data.id + '/payments', ota, {
      request_id: 'req-ota-pay1',
      amount: 100,
      method: 'card',
    });
    assert.equal(pay.status, 201);
    assert.equal(pay.data.data.payment.created_by_name, 'Ota');
    assert.equal(pay.data.data.payment.created_by_telegram_id, '1002');
    assert.equal(pay.data.data.payment.created_by_username, 'ota');

    store.waybills.push({
      id: 900,
      waybill_code: 'YX-OLD',
      agent_id: null,
      customer_id: customer.data.data.id,
      total_amount: 10,
      paid_amount: 0,
      debt_amount: 10,
      sale_date: '2026-10-01',
      due_date: '2026-10-02',
      status: 'open',
    });
    const detail = await call('/api/agent/yuk/customers/' + customer.data.data.id, aka);
    assert.equal(detail.status, 200);
    const old = detail.data.data.waybills.find(function (w) { return w.waybill_code === 'YX-OLD'; });
    assert.equal(old.created_by_telegram_id == null, true);
    assert.equal(old.created_by_name, 'Eski yozuv');
    const fresh = detail.data.data.waybills.find(function (w) { return w.created_by_telegram_id === '1001'; });
    assert.equal(fresh.created_by_name, 'Aka Karimov');
    const cardPay = detail.data.data.payments.find(function (p) { return p.created_by_telegram_id === '1002'; });
    assert.equal(cardPay.created_by_name, 'Ota');
    const salePay = detail.data.data.payments.find(function (p) { return p.created_by_telegram_id === '1001'; });
    assert.equal(salePay.created_by_name, 'Aka Karimov');

    const adminRes = await fetch(base + '/api/agent/admin/waybills?scope=admin', {
      headers: { 'x-admin-key': 'secret-admin' },
    });
    const adminBody = await adminRes.json();
    assert.equal(adminRes.status, 200);
    const listed = adminBody.data.find(function (w) { return w.created_by_telegram_id === '1001'; });
    assert.equal(listed.created_by_name, 'Aka Karimov');
    const legacy = adminBody.data.find(function (w) { return w.waybill_code === 'YX-OLD'; });
    assert.equal(legacy.created_by_name, 'Eski yozuv');
  } finally {
    server.close();
    if (prevToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
    if (prevIds == null) delete process.env.ADMIN_TELEGRAM_IDS;
    else process.env.ADMIN_TELEGRAM_IDS = prevIds;
    if (prevKey == null) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = prevKey;
    if (prevNode == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  }
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
  const creatorSqlRaw = fs.readFileSync(path.join(root, 'migrations/008_yuk_creator.sql'), 'utf8');
  const creatorSql = creatorSqlRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  assert.match(creatorSql, /waybills ADD COLUMN IF NOT EXISTS created_by_telegram_id TEXT/);
  assert.match(creatorSql, /waybills ADD COLUMN IF NOT EXISTS created_by_first_name TEXT/);
  assert.match(creatorSql, /waybills ADD COLUMN IF NOT EXISTS created_by_last_name TEXT/);
  assert.match(creatorSql, /waybills ADD COLUMN IF NOT EXISTS created_by_username TEXT/);
  assert.match(creatorSql, /payments ADD COLUMN IF NOT EXISTS created_by_telegram_id TEXT/);
  assert.match(creatorSql, /payments ADD COLUMN IF NOT EXISTS created_by_username TEXT/);
  assert.doesNotMatch(creatorSql, /\bUPDATE\b/i);
  assert.doesNotMatch(creatorSql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(creatorSql, /\bDROP\b/i);
  assert.doesNotMatch(creatorSql, /\bNOT NULL\b/i);
  const page = fs.readFileSync(path.join(root, 'public/yuk.html'), 'utf8');
  assert.match(page, /Sotuv/);
  assert.match(page, /Do'konlar/);
  assert.match(page, /Eslatma/);
  assert.match(page, /Sozlama/);
  assert.match(page, /Saqlash va yuk xati/);
  assert.match(page, /function readInitData/);
  assert.match(page, /tg\.ready\(\)/);
  assert.match(page, /Asia\/Tashkent/);
  assert.match(page, /init_data=/);
  assert.match(page, /tma /);
  assert.match(page, /\.field:focus/);
  assert.doesNotMatch(page, /8600\s*\d{4}/);
  assert.doesNotMatch(page, /ADMIN_TELEGRAM_IDS\s*=\s*['"]\d+/);
  assert.match(page, /Yozgan:/);
  assert.match(page, /Eski yozuv/);
  const adminUi = fs.readFileSync(path.join(root, 'public/admin-v2-components.jsx'), 'utf8');
  assert.match(adminUi, /Yozgan/);
  assert.match(adminUi, /Batafsil/);
  assert.match(adminUi, /created_by_name/);
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
