const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const plan = require('../lib/reminder-plan');
const run = require('../lib/reminder-run');

const SECRET = 'test-callback-secret';

function bill(extra) {
  return Object.assign({
    waybill_id: 18,
    id: 18,
    waybill_code: 'YX-LEG-18',
    customer_id: 4,
    customer_name: 'Shamaton',
    telegram_id: '555',
    total_amount: 2290000,
    paid_amount: 1500000,
    debt_amount: 790000,
    due_date: '2026-11-03',
  }, extra || {});
}

test('reminder is due on the due date and repeats after the gap', () => {
  assert.deepEqual(plan.reminderDecision({
    dueYmd: '2026-11-03',
    todayYmd: '2026-11-03',
    lastSentYmd: '',
    repeatDays: 3,
    sentToday: false,
  }), { send: true, kind: 'due' });
  assert.equal(plan.reminderDecision({
    dueYmd: '2026-11-04',
    todayYmd: '2026-11-03',
    repeatDays: 3,
    sentToday: false,
  }).reason, 'not_due');
  assert.equal(plan.reminderDecision({
    dueYmd: '2026-11-01',
    todayYmd: '2026-11-03',
    lastSentYmd: '2026-11-01',
    repeatDays: 3,
    sentToday: false,
  }).reason, 'wait');
  assert.deepEqual(plan.reminderDecision({
    dueYmd: '2026-11-01',
    todayYmd: '2026-11-04',
    lastSentYmd: '2026-11-01',
    repeatDays: 3,
    sentToday: false,
  }), { send: true, kind: 'repeat' });
  assert.equal(plan.reminderDecision({
    dueYmd: '2026-11-01',
    todayYmd: '2026-11-04',
    lastSentYmd: '2026-11-01',
    repeatDays: 3,
    sentToday: true,
  }).reason, 'already_today');
  assert.equal(plan.formatSom(1234000), "1 234 000 so'm");
});

test('one waybill gets at most one reminder per day and skips a missing telegram id', async () => {
  const calls = [];
  const logs = [];
  const base = {
    loadSettings: async function () {
      return { reminders_enabled: 'true', reminder_repeat_days: '3', admin_chat_id: '111' };
    },
    lastReminder: async function () { return null; },
    sentOn: async function (id) { return String(id) === '2'; },
    insertReminder: async function (row) { calls.push(row); },
    log: function (line) { logs.push(line); },
    secret: SECRET,
    env: {},
    sendMessage: async function (input) {
      calls.push({ chat: input.chatId, text: input.text, markup: input.replyMarkup || null });
      return { message_id: 9 };
    },
  };
  const result = await run.runReminders(Object.assign({}, base, {
    listDue: async function () {
      return [
        bill({ waybill_id: 1, waybill_code: 'YX-1', telegram_id: '' }),
        bill({ waybill_id: 2, waybill_code: 'YX-2', telegram_id: '555' }),
        bill({ waybill_id: 3, waybill_code: 'YX-3', telegram_id: '555', due_date: '2026-11-03' }),
      ];
    },
  }), { today: '2026-11-03' });
  assert.equal(result.sent.length, 1);
  assert.equal(result.sent[0].waybill_id, 3);
  assert.equal(result.sent[0].kind, 'due');
  assert.ok(result.held.some(function (row) { return row.reason === 'no_telegram'; }));
  assert.ok(result.held.some(function (row) { return row.waybill_id === 2 && row.reason === 'already_today'; }));
  assert.ok(logs.some(function (line) { return line.indexOf('YX-1') !== -1; }));
  const customerSends = calls.filter(function (row) { return row.chat === '555'; });
  assert.equal(customerSends.length, 1);
  assert.equal(JSON.stringify(customerSends[0].markup).indexOf("To'lash"), -1);
  assert.equal(calls.filter(function (row) { return row.waybillId === 3; }).length, 1);
});

test('pay button stays hidden until a checkout env is set', () => {
  const row = bill();
  const plain = plan.customerKeyboard(row, {}, SECRET);
  assert.equal(JSON.stringify(plain).indexOf("To'lash"), -1);
  const payme = plan.customerKeyboard(row, { PAYME_MERCHANT_ID: 'merchant-1' }, SECRET);
  assert.match(JSON.stringify(payme), /To'lash/);
  assert.match(JSON.stringify(payme), /checkout\.paycom\.uz/);
  const tampered = plan.readCallback('y:7:deadbeefdead', SECRET);
  assert.equal(tampered, null);
});

test('approving a claim reduces the waybill debt and a foreign chat is rejected', async () => {
  const state = {
    debt: 790000,
    paid: 1500000,
    total: 2290000,
    approved: false,
  };
  const sent = [];
  let applied = 0;
  const deps = {
    secret: SECRET,
    loadSettings: async function () {
      return { reminders_enabled: 'false', reminder_repeat_days: '3', admin_chat_id: '111' };
    },
    getWaybill: async function () { return bill({ debt_amount: state.debt, paid_amount: state.paid }); },
    insertClaim: async function (row) {
      return { id: 7, amount: row.amount, waybill_id: row.waybillId, customer_id: row.customerId, status: 'pending' };
    },
    sendMessage: async function (input) { sent.push(input); return { message_id: 1 }; },
    answer: async function () {},
    log: function () {},
    approveClaim: async function (id, by) {
      assert.equal(id, '7');
      assert.equal(by, '111');
      const money = plan.settleMoney({
        total_amount: state.total,
        paid_amount: state.paid,
        alloc_count: 1,
        alloc_sum: state.paid,
      }, 200000);
      state.paid = money.paid;
      state.debt = money.debt;
      state.approved = true;
      applied += 1;
      return { money: money, waybill: bill({ telegram_id: '555', debt_amount: money.debt }) };
    },
    rejectClaim: async function () { throw new Error('rad chaqirilmasin'); },
  };
  const ask = plan.signCallback('a', [18, 200000], SECRET);
  const opened = await run.handleUpdate(deps, {
    callback_query: {
      id: 'cb1',
      data: ask,
      from: { id: 555 },
      message: { chat: { id: 555 } },
    },
  });
  assert.equal(opened.ok, true);
  assert.equal(opened.claim.amount, 200000);
  assert.ok(sent.some(function (row) { return row.text === "Tekshirilmoqda"; }));
  assert.ok(sent.some(function (row) { return row.chatId === '111' && row.replyMarkup; }));

  const foreign = await run.handleUpdate(deps, {
    callback_query: {
      id: 'cb2',
      data: plan.signCallback('y', [7], SECRET),
      from: { id: 999 },
      message: { chat: { id: 999 } },
    },
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason, 'foreign_chat');
  assert.equal(applied, 0);

  const stranger = await run.handleUpdate(deps, {
    callback_query: {
      id: 'cb3',
      data: plan.signCallback('p', [18], SECRET),
      from: { id: 777 },
      message: { chat: { id: 777 } },
    },
  });
  assert.equal(stranger.reason, 'not_owner');

  const approved = await run.handleUpdate(deps, {
    callback_query: {
      id: 'cb4',
      data: plan.signCallback('y', [7], SECRET),
      from: { id: 1 },
      message: { chat: { id: 111 } },
    },
  });
  assert.equal(approved.ok, true);
  assert.equal(state.paid, 1700000);
  assert.equal(state.debt, 590000);
  assert.equal(approved.money.status, 'partial');
  assert.equal(applied, 1);
});

test('reminder migration is additive and the mijoz webhook is separate', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/014_debt_reminders.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS debt_reminders/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS payment_claims/);
  assert.match(sql, /reminders_enabled', 'false'/);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  const db = fs.readFileSync(path.join(__dirname, '../lib/reminder-db.js'), 'utf8');
  assert.match(db, /INSERT INTO payments/);
  assert.match(db, /INSERT INTO payment_allocations/);
  assert.match(db, /UPDATE waybills/);
  assert.doesNotMatch(db, /\bDELETE\s+FROM\b/i);
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(server, /\/api\/cron\/reminders/);
  assert.match(server, /\/api\/customer\/telegram-webhook/);
  assert.match(server, /@briketborbot webhooki ko'chirilmaydi/);
  const yuk = fs.readFileSync(path.join(__dirname, '../routes-yuk.js'), 'utf8');
  assert.match(yuk, /\/api\/agent\/yuk\/telegram-webhook/);
  const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
  assert.match(html, /reminder-settings\.js/);
  const ui = fs.readFileSync(path.join(__dirname, '../public/reminder-settings.js'), 'utf8');
  assert.match(ui, /Hozir yubor \(test\)/);
  assert.match(ui, /To'ladim so'rovlari/);
});
