/**
 * PDF va matn faqat @briket_mijoz_bot (TELEGRAM_BOT_TOKEN) orqali.
 * @briketborbot webhookiga tegilmaydi.
 */
const { httpError } = require('./agent-money');

async function sendNakladnoyPdf(input) {
  const token = String((input && input.token) || '').trim();
  const chatId = input && input.chatId != null ? String(input.chatId).trim() : '';
  if (!token) throw httpError(503, 'TELEGRAM_BOT_TOKEN o\'rnatilmagan');
  if (!chatId) throw httpError(400, 'Mijozda Telegram ID yo\'q');
  const pdf = input.pdf;
  if (!pdf || !pdf.length) throw httpError(500, 'Nakladnoy PDF bo\'sh');
  const fetchImpl = input.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw httpError(500, 'fetch yo\'q');
  const form = new FormData();
  form.append('chat_id', chatId);
  if (input.caption) form.append('caption', String(input.caption).slice(0, 1000));
  const filename = input.filename || 'yuk-xati.pdf';
  form.append('document', new Blob([pdf], { type: 'application/pdf' }), filename);
  const res = await fetchImpl('https://api.telegram.org/bot' + token + '/sendDocument', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data || data.ok !== true) {
    const desc = data && data.description ? data.description : 'Telegram javob bermadi';
    throw httpError(502, 'Nakladnoy yuborilmadi: ' + desc);
  }
  return { ok: true, message_id: data.result && data.result.message_id };
}

async function sendNakladnoyText(input) {
  const token = String((input && input.token) || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = input && input.chatId != null ? String(input.chatId).trim() : '';
  if (!token) throw httpError(503, 'TELEGRAM_BOT_TOKEN o\'rnatilmagan');
  if (!chatId) throw httpError(400, 'Mijozda Telegram ID yo\'q');
  const text = String(input.text || '');
  if (!text) throw httpError(400, 'Nakladnoy matni bo\'sh');
  const fetchImpl = input.fetchImpl || global.fetch;
  const res = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data || data.ok !== true) {
    throw httpError(502, 'Nakladnoy yuborilmadi: ' + ((data && data.description) || 'Telegram javob bermadi'));
  }
  return { ok: true, message_id: data.result && data.result.message_id };
}

module.exports = {
  sendNakladnoyPdf: sendNakladnoyPdf,
  sendNakladnoyText: sendNakladnoyText,
};
