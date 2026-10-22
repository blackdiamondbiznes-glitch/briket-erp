/**
 * Serverdagi PDF ni Telegram hujjat sifatida yuboradi.
 * Mini-app edge funksiyasi bu muhitda o'qilmadi — format shu ERP nakladnoyi.
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

module.exports = { sendNakladnoyPdf: sendNakladnoyPdf };
