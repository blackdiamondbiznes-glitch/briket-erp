#!/usr/bin/env node
/**
 * Jonli serverga tutun testi. Production hostiga chiqmaydi.
 *
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 \
 *   ADMIN_KEY=... TELEGRAM_BOT_TOKEN=... \
 *   node scripts/smoke-agent.js
 *
 * Bazada migrations/004_agent_field_sales.sql qo'llangan bo'lishi kerak.
 * Bu skript yozadi (test agent, do'kon, yuk xati) — production URLda ishlamaydi.
 */
const { signTelegramInitData } = require('../lib/telegram-webapp');

const base = (process.env.SMOKE_BASE_URL || '').trim().replace(/\/$/, '');
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const adminKey = (process.env.ADMIN_KEY || '').trim();

function refuse(msg) {
  console.error(msg);
  process.exit(1);
}

if (!base || !token || !adminKey) {
  refuse('SMOKE_BASE_URL, TELEGRAM_BOT_TOKEN va ADMIN_KEY kerak');
}
if (/render\.com|supabase\.co|briket/i.test(base) && process.env.SMOKE_I_KNOW !== 'local') {
  refuse('Bu URL productionga o\'xshaydi. Lokal serverda ishlating.');
}

function initFor(id, name) {
  return signTelegramInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: 'smoke',
      user: JSON.stringify({ id: id, first_name: name, username: 'smoke' + id }),
    },
    token
  );
}

async function call(path, opts) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
  const res = await fetch(base + path, {
    method: (opts && opts.method) || 'GET',
    headers: headers,
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data: data, text: text };
}

async function main() {
  const noAuth = await call('/api/agent/me');
  if (noAuth.status !== 401) refuse('tokensiz /api/agent/me 401 bo\'lishi kerak, keldi ' + noAuth.status);

  const tg = initFor(910000001, 'Smoke');
  const me = await call('/api/agent/me', { headers: { 'x-telegram-init-data': tg } });
  if (me.status !== 200) refuse('/api/agent/me ' + me.status + ' ' + JSON.stringify(me.data));

  const req = await call('/api/agent/access-requests', {
    method: 'POST',
    headers: { 'x-telegram-init-data': tg },
    body: { full_name: 'Smoke Agent' },
  });
  if (req.status !== 200) refuse('access-request ' + req.status);

  const denied = await call('/api/agent/admin/access-requests?status=pending');
  if (denied.status !== 401 && denied.status !== 503) {
    refuse('admin kalitsiz so\'rov ochiq qoldi: ' + denied.status);
  }

  const pending = await call('/api/agent/admin/access-requests?status=pending', {
    headers: { 'x-admin-key': adminKey },
  });
  if (pending.status !== 200) refuse('admin list ' + pending.status + ' ' + JSON.stringify(pending.data));
  const mine = (pending.data.data || []).filter((r) => String(r.telegram_id) === '910000001' && r.status === 'pending');
  if (!mine.length && !(req.data.data && req.data.data.already_approved)) {
    refuse('kutilayotgan so\'rov topilmadi');
  }
  if (mine.length) {
    const ok = await call('/api/agent/admin/access-requests/' + mine[0].id + '/approve', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'x-operator-name': 'smoke' },
      body: {},
    });
    if (ok.status !== 200) refuse('approve ' + ok.status + ' ' + JSON.stringify(ok.data));
  }

  const products = await call('/api/agent/products', { headers: { 'x-telegram-init-data': tg } });
  if (products.status !== 200 || !(products.data.data || []).length) {
    refuse('mahsulot yo\'q yoki 200 emas: ' + products.status);
  }
  const product = products.data.data[0];
  const customer = await call('/api/agent/customers', {
    method: 'POST',
    headers: { 'x-telegram-init-data': tg },
    body: { name: 'Smoke do\'kon', phone: '901112233', latitude: 41.3, longitude: 69.2 },
  });
  if (customer.status !== 201) refuse('customer ' + customer.status + ' ' + JSON.stringify(customer.data));

  const waybill = await call('/api/agent/waybills', {
    method: 'POST',
    headers: { 'x-telegram-init-data': tg },
    body: {
      customer_id: customer.data.data.id,
      paid_amount: 0,
      total_amount: 1,
      items: [{ product_id: product.id, quantity: 2, price: 1000, commission: 100, subtotal: 1 }],
    },
  });
  if (waybill.status !== 201) refuse('waybill ' + waybill.status + ' ' + JSON.stringify(waybill.data));
  if (Number(waybill.data.data.total_amount) !== 2000) {
    refuse('server jami 2000 bo\'lishi kerak, keldi ' + waybill.data.data.total_amount);
  }
  const html = await call('/api/agent/waybills/' + waybill.data.data.id + '/nakladnoy', {
    headers: { 'x-telegram-init-data': tg },
  });
  if (html.status !== 200 || html.text.indexOf('Yuk xati') === -1) refuse('nakladnoy HTML yo\'q');
  console.log('smoke ok', waybill.data.data.waybill_code);
}

main().catch(function (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
