/**
 * Qarz eslatmasi.
 * POST /api/cron/reminders — X-Cron-Secret. @briketborbot webhookiga tegilmaydi.
 * POST /api/customer/telegram-webhook — @briket_mijoz_bot callbacklari.
 */
const plan = require('./lib/reminder-plan');
const run = require('./lib/reminder-run');
const db = require('./lib/reminder-db');

function callbackSecret() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function payEnv() {
  return {
    PAYME_MERCHANT_ID: process.env.PAYME_MERCHANT_ID || '',
    CLICK_SERVICE_ID: process.env.CLICK_SERVICE_ID || '',
  };
}

module.exports = function registerReminders(app, pool) {
  const store = db.createReminderDb(pool, { secret: callbackSecret() });

  function deps() {
    const token = callbackSecret();
    return {
      loadSettings: function () { return store.loadSettings(); },
      listDue: function (today) { return store.listDue(today); },
      lastReminder: function (id) { return store.lastReminder(id); },
      sentOn: function (id, today) { return store.sentOn(id, today); },
      insertReminder: function (row) { return store.insertReminder(row); },
      getWaybill: function (id) { return store.getWaybill(id); },
      insertClaim: function (row) { return store.insertClaim(row); },
      approveClaim: function (id, by) { return store.approveClaim(id, by); },
      rejectClaim: function (id, by) { return store.rejectClaim(id, by); },
      today: function () { return store.today(); },
      log: function (line) { store.log(line); },
      secret: token,
      env: payEnv(),
      sendMessage: function (input) {
        const body = { chat_id: input.chatId, text: String(input.text || '').slice(0, 4000) };
        if (input.replyMarkup) body.reply_markup = input.replyMarkup;
        return db.telegramCall(token, 'sendMessage', body).then(function (result) {
          return { message_id: result.message_id };
        });
      },
      answer: function (id, text) {
        if (!id) return Promise.resolve();
        return db.telegramCall(token, 'answerCallbackQuery', {
          callback_query_id: id,
          text: String(text || '').slice(0, 180),
        }).catch(function () { return null; });
      },
    };
  }

  app.post('/api/cron/reminders', async (req, res) => {
    const expected = String(process.env.CRON_SECRET || '').trim();
    const given = req.headers['x-cron-secret'];
    if (!expected) return res.status(503).json({ ok: false, error: 'CRON_SECRET yo\'q' });
    if (!given || !plan.safeEqual(given, expected)) {
      return res.status(401).json({ ok: false, error: 'Ruxsat yo\'q' });
    }
    try {
      const result = await run.runReminders(deps(), {});
      res.json({ ok: true, data: result });
    } catch (err) {
      console.error(plan.redact(err && err.message, callbackSecret()));
      res.status(500).json({ ok: false, error: 'Eslatma yuborilmadi' });
    }
  });

  app.post('/api/customer/telegram-webhook', async (req, res) => {
    const expected = String(process.env.MIJOZ_WEBHOOK_SECRET || '').trim();
    if (!expected) return res.status(503).json({ ok: false, error: 'MIJOZ_WEBHOOK_SECRET yo\'q' });
    const given = req.headers['x-telegram-bot-api-secret-token'];
    if (!given || !plan.safeEqual(given, expected)) {
      return res.status(401).json({ ok: false, error: 'Ruxsat yo\'q' });
    }
    try {
      await run.handleUpdate(deps(), req.body || {});
      res.json({ ok: true });
    } catch (err) {
      console.error(plan.redact(err && err.message, callbackSecret()));
      res.json({ ok: true });
    }
  });

  app.get('/api/reminders/claims', async (req, res) => {
    try {
      const rows = await store.listClaims();
      res.json({ ok: true, data: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'So\'rovlar o\'qilmadi' });
    }
  });

  app.post('/api/reminders/run', async (req, res) => {
    try {
      const result = await run.runReminders(deps(), { force: true });
      res.json({ ok: true, data: result });
    } catch (err) {
      console.error(plan.redact(err && err.message, callbackSecret()));
      res.status(500).json({ ok: false, error: 'Eslatma yuborilmadi' });
    }
  });
};
