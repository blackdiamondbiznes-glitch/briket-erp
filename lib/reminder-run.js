/**
 * Eslatma yuborish va "To'ladim" oqimi.
 * Deps orqali baza va Telegram beriladi. Tokenni o'zi loglamaydi.
 */
const plan = require('./reminder-plan');

const pendingClaims = new Map();

function rememberPrompt(chatId, info) {
  pendingClaims.set(String(chatId), {
    waybillId: String(info.waybillId),
    debt: plan.whole(info.debt),
    expires: Date.now() + 30 * 60 * 1000,
  });
}

function takePrompt(chatId) {
  const row = pendingClaims.get(String(chatId));
  if (!row) return null;
  if (row.expires < Date.now()) {
    pendingClaims.delete(String(chatId));
    return null;
  }
  return row;
}

function repeatDays(settings) {
  const n = plan.whole(settings && settings.reminder_repeat_days);
  return n > 0 ? n : 3;
}

async function runReminders(deps, opts) {
  const options = opts || {};
  const settings = await deps.loadSettings();
  if (!options.force && !plan.truthy(settings.reminders_enabled)) {
    return { ok: true, skipped: 'disabled', sent: [], held: [] };
  }
  const today = options.today || deps.today();
  const repeat = repeatDays(settings);
  const due = await deps.listDue(today);
  const sent = [];
  const held = [];
  for (let i = 0; i < due.length; i++) {
    const row = due[i];
    const code = row.waybill_code || String(row.waybill_id);
    if (!String(row.telegram_id || '').trim()) {
      deps.log("telegram_id yo'q: " + code);
      held.push({ waybill_id: row.waybill_id, reason: 'no_telegram' });
      continue;
    }
    const last = await deps.lastReminder(row.waybill_id);
    const sentToday = await deps.sentOn(row.waybill_id, today);
    const decision = plan.reminderDecision({
      dueYmd: String(row.due_date || '').slice(0, 10),
      todayYmd: today,
      lastSentYmd: last && last.sent_on,
      repeatDays: repeat,
      sentToday: sentToday,
    });
    if (!decision.send) {
      held.push({ waybill_id: row.waybill_id, reason: decision.reason });
      continue;
    }
    const text = plan.buildReminderText(row);
    const markup = plan.customerKeyboard(row, deps.env || {}, deps.secret);
    try {
      const msg = await deps.sendMessage({
        chatId: String(row.telegram_id),
        text: text,
        replyMarkup: markup,
      });
      await deps.insertReminder({
        waybillId: row.waybill_id,
        customerId: row.customer_id,
        kind: decision.kind,
        messageId: msg && msg.message_id,
        status: 'sent',
      });
      if (String(settings.admin_chat_id || '').trim()) {
        try {
          await deps.sendMessage({
            chatId: String(settings.admin_chat_id).trim(),
            text: 'Eslatma nusxasi\n\n' + text,
          });
        } catch (err) {
          deps.log('admin nusxasi: ' + plan.redact(err && err.message, deps.secret));
        }
      }
      sent.push({ waybill_id: row.waybill_id, kind: decision.kind });
    } catch (err) {
      deps.log('yuborilmadi ' + code + ': ' + plan.redact(err && err.message, deps.secret));
      held.push({ waybill_id: row.waybill_id, reason: 'send_failed' });
    }
  }
  return { ok: true, sent: sent, held: held };
}

async function openClaim(deps, waybill, amount, fromId) {
  const debt = plan.whole(waybill.debt_amount);
  const sum = plan.whole(amount);
  if (!(sum > 0) || sum > debt) {
    return { ok: false, reason: 'amount', text: "Summa qarzdan oshmasin. Qarz: " + plan.formatSom(debt) };
  }
  if (String(waybill.telegram_id || '') !== String(fromId)) {
    return { ok: false, reason: 'not_owner' };
  }
  const claim = await deps.insertClaim({
    waybillId: waybill.waybill_id || waybill.id,
    customerId: waybill.customer_id,
    amount: sum,
  });
  const settings = await deps.loadSettings();
  const admin = String(settings.admin_chat_id || '').trim();
  if (admin) {
    const text = [
      "To'lov so'rovi #" + claim.id,
      "Do'kon: " + (waybill.customer_name || ''),
      'Yuk xati: ' + (waybill.waybill_code || ''),
      'Summa: ' + plan.formatSom(sum),
    ].join('\n');
    try {
      await deps.sendMessage({
        chatId: admin,
        text: text,
        replyMarkup: plan.adminKeyboard(claim.id, deps.secret),
      });
    } catch (err) {
      deps.log('admin nusxasi: ' + plan.redact(err && err.message, deps.secret));
    }
  }
  return { ok: true, claim: claim, text: "Tekshirilmoqda" };
}

async function onCallback(deps, cb) {
  const parsed = plan.readCallback(cb.data, deps.secret);
  if (!parsed) {
    if (deps.answer) await deps.answer(cb.id, 'Xato');
    return { ok: false, reason: 'bad_signature' };
  }
  const chatId = cb.message && cb.message.chat ? cb.message.chat.id : '';
  const fromId = cb.from ? cb.from.id : '';
  if (parsed.action === 'y' || parsed.action === 'n') {
    const settings = await deps.loadSettings();
    if (!settings.admin_chat_id || String(chatId) !== String(settings.admin_chat_id)) {
      if (deps.answer) await deps.answer(cb.id, "Ruxsat yo'q");
      return { ok: false, reason: 'foreign_chat' };
    }
    if (parsed.action === 'n') {
      const rejected = await deps.rejectClaim(parsed.claimId, String(chatId));
      if (rejected && rejected.waybill && rejected.waybill.telegram_id) {
        await deps.sendMessage({
          chatId: rejected.waybill.telegram_id,
          text: "To'lov tasdiqlanmadi. Yuk xati: " + (rejected.waybill.waybill_code || ''),
        });
      }
      if (deps.answer) await deps.answer(cb.id, 'Rad etildi');
      return { ok: true, status: 'rejected' };
    }
    const approved = await deps.approveClaim(parsed.claimId, String(chatId));
    if (!approved || approved.reason) {
      if (deps.answer) await deps.answer(cb.id, 'Tasdiqlanmadi');
      return { ok: false, reason: approved && approved.reason ? approved.reason : 'approve' };
    }
    if (approved.waybill && approved.waybill.telegram_id) {
      const left = plan.formatSom(approved.money.debt);
      const text = approved.money.debt <= 0
        ? "To'lovingiz tasdiqlandi. Qarz yopildi."
        : "To'lovingiz tasdiqlandi. Qolgan qarz: " + left;
      await deps.sendMessage({ chatId: approved.waybill.telegram_id, text: text });
    }
    if (deps.answer) await deps.answer(cb.id, 'Tasdiqlandi');
    return { ok: true, status: 'approved', money: approved.money };
  }
  const waybill = await deps.getWaybill(parsed.waybillId);
  if (!waybill || String(waybill.telegram_id || '') !== String(fromId)) {
    if (deps.answer) await deps.answer(cb.id, "Ruxsat yo'q");
    return { ok: false, reason: 'not_owner' };
  }
  if (parsed.action === 'p') {
    rememberPrompt(chatId, { waybillId: waybill.waybill_id || waybill.id, debt: waybill.debt_amount });
    await deps.sendMessage({
      chatId: chatId,
      text: "Summani yozing.\nYuk xati: " + (waybill.waybill_code || '') +
        "\nQarz: " + plan.formatSom(waybill.debt_amount),
      replyMarkup: plan.amountKeyboard(waybill.waybill_id || waybill.id, waybill.debt_amount, deps.secret),
    });
    if (deps.answer) await deps.answer(cb.id, 'Summa');
    return { ok: true, status: 'ask' };
  }
  const opened = await openClaim(deps, waybill, parsed.amount, fromId);
  if (!opened.ok) {
    if (deps.answer) await deps.answer(cb.id, opened.text || "Ruxsat yo'q");
    return opened;
  }
  await deps.sendMessage({ chatId: chatId, text: opened.text });
  if (deps.answer) await deps.answer(cb.id, "Tekshirilmoqda");
  return opened;
}

async function onText(deps, message) {
  const chatId = message.chat ? message.chat.id : '';
  const prompt = takePrompt(chatId);
  if (!prompt) return { ok: true, ignored: true };
  const amount = plan.parseSom(message.text);
  const fromId = message.from ? message.from.id : '';
  const waybill = await deps.getWaybill(prompt.waybillId);
  if (!waybill || String(waybill.telegram_id || '') !== String(fromId)) {
    return { ok: false, reason: 'not_owner' };
  }
  if (amount == null) {
    await deps.sendMessage({ chatId: chatId, text: "Summani raqam bilan yozing. Qarz: " + plan.formatSom(prompt.debt) });
    rememberPrompt(chatId, prompt);
    return { ok: false, reason: 'amount' };
  }
  const opened = await openClaim(deps, waybill, amount, fromId);
  await deps.sendMessage({ chatId: chatId, text: opened.text || "Summa qarzdan oshmasin" });
  if (opened.ok) pendingClaims.delete(String(chatId));
  return opened;
}

async function handleUpdate(deps, update) {
  if (!update || typeof update !== 'object') return { ok: false, reason: 'empty' };
  if (update.callback_query) return onCallback(deps, update.callback_query);
  if (update.message && update.message.text) return onText(deps, update.message);
  return { ok: true, ignored: true };
}

module.exports = {
  runReminders: runReminders,
  handleUpdate: handleUpdate,
  openClaim: openClaim,
  rememberPrompt: rememberPrompt,
};
