/**
 * Qarz eslatmasi: sana, matn, tugma. Bazaga yozmaydi.
 * callback_data HMAC bilan imzolanadi. Token logga tushmaydi.
 */
const crypto = require('crypto');

const TZ = 'Asia/Tashkent';

function whole(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function tashkentYmd(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date || new Date());
}

function ymdUtc(ymd) {
  const parts = String(ymd || '').split('-');
  if (parts.length !== 3) return NaN;
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function daysBetween(fromYmd, toYmd) {
  const a = ymdUtc(fromYmd);
  const b = ymdUtc(toYmd);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / 86400000);
}

function formatSom(value) {
  const n = whole(value);
  const sign = n < 0 ? '-' : '';
  const body = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + body + " so'm";
}

function formatDmy(ymd) {
  const text = String(ymd || '').slice(0, 10);
  const parts = text.split('-');
  if (parts.length !== 3) return text;
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

function truthy(value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'ha';
}

/**
 * Birinchi eslatma muddat kunida (yoki undan keyin, hali yuborilmagan bo'lsa).
 * Keyingisi oxirgi eslatmadan reminder_repeat_days o'tganda.
 * Bir kunda bitta yuk xatiga bitta xabar.
 */
function reminderDecision(input) {
  const due = String(input.dueYmd || '').slice(0, 10);
  const today = String(input.todayYmd || '').slice(0, 10);
  const repeat = Math.max(1, whole(input.repeatDays) || 3);
  if (!due || !today || due > today) return { send: false, reason: 'not_due' };
  if (input.sentToday) return { send: false, reason: 'already_today' };
  const last = input.lastSentYmd ? String(input.lastSentYmd).slice(0, 10) : '';
  if (!last) return { send: true, kind: 'due' };
  const passed = daysBetween(last, today);
  if (passed >= repeat) return { send: true, kind: 'repeat' };
  return { send: false, reason: 'wait' };
}

function buildReminderText(row) {
  const name = row.customer_name || row.store_name || "Do'kon";
  const code = row.waybill_code || ('#' + row.waybill_id);
  const due = formatDmy(row.due_date);
  return [
    'Qarz eslatmasi',
    '',
    "Do'kon: " + name,
    'Yuk xati: ' + code,
    'Jami: ' + formatSom(row.total_amount),
    "To'langan: " + formatSom(row.paid_amount),
    'Qarz: ' + formatSom(row.debt_amount),
    'Muddat: ' + due,
  ].join('\n');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function signBody(body, secret) {
  return crypto.createHmac('sha256', String(secret || '')).update(String(body)).digest('hex').slice(0, 12);
}

function signCallback(action, parts, secret) {
  const body = [action].concat((parts || []).map(function (part) { return String(part); })).join(':');
  return body + ':' + signBody(body, secret);
}

function readCallback(data, secret) {
  const text = String(data || '');
  const cut = text.lastIndexOf(':');
  if (cut <= 0) return null;
  const body = text.slice(0, cut);
  const sig = text.slice(cut + 1);
  if (!safeEqual(sig, signBody(body, secret))) return null;
  const bits = body.split(':');
  const action = bits[0];
  if (action === 'p' && bits.length === 2 && /^\d+$/.test(bits[1])) {
    return { action: 'p', waybillId: bits[1] };
  }
  if (action === 'a' && bits.length === 3 && /^\d+$/.test(bits[1]) && /^\d+$/.test(bits[2])) {
    return { action: 'a', waybillId: bits[1], amount: whole(bits[2]) };
  }
  if ((action === 'y' || action === 'n') && bits.length === 2 && /^\d+$/.test(bits[1])) {
    return { action: action, claimId: bits[1] };
  }
  return null;
}

function checkoutLink(env, row) {
  const cfg = env || {};
  const payme = String(cfg.PAYME_MERCHANT_ID || '').trim();
  const click = String(cfg.CLICK_SERVICE_ID || '').trim();
  const code = String(row.waybill_code || row.waybill_id || '');
  const amount = whole(row.debt_amount);
  if (!(amount > 0) || !code) return '';
  if (payme) {
    const params = 'm=' + payme + ';ac.waybill=' + code + ';a=' + String(amount * 100);
    return 'https://checkout.paycom.uz/' + Buffer.from(params, 'utf8').toString('base64');
  }
  if (click) {
    return 'https://my.click.uz/services/pay?service_id=' + encodeURIComponent(click) +
      '&amount=' + encodeURIComponent(String(amount)) +
      '&transaction_param=' + encodeURIComponent(code);
  }
  return '';
}

function customerKeyboard(row, env, secret) {
  const rows = [[{
    text: "✅ To'ladim",
    callback_data: signCallback('p', [row.waybill_id], secret),
  }]];
  const link = checkoutLink(env, row);
  if (link) rows.push([{ text: "To'lash", url: link }]);
  return { inline_keyboard: rows };
}

function amountKeyboard(waybillId, debt, secret) {
  const amount = whole(debt);
  return {
    inline_keyboard: [[{
      text: formatSom(amount),
      callback_data: signCallback('a', [waybillId, amount], secret),
    }]],
  };
}

function adminKeyboard(claimId, secret) {
  return {
    inline_keyboard: [[
      { text: 'Tasdiqlash', callback_data: signCallback('y', [claimId], secret) },
      { text: 'Rad etish', callback_data: signCallback('n', [claimId], secret) },
    ]],
  };
}

function parseSom(text) {
  const digits = String(text || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = whole(digits);
  return n > 0 ? n : null;
}

/**
 * Mavjud to'lov yig'indisi ustiga claim qo'shiladi.
 * Allocation bo'lmasa, eski paid backfill hisoblanadi.
 */
function settleMoney(bill, claimAmount) {
  const total = whole(bill.total_amount);
  const paidNow = whole(bill.paid_amount);
  const allocCount = whole(bill.alloc_count);
  const allocSum = whole(bill.alloc_sum);
  const add = whole(claimAmount);
  const base = allocCount > 0 ? allocSum : paidNow;
  if (!(add > 0)) return { error: 'amount' };
  if (base + add > total) return { error: 'over' };
  const paid = base + add;
  const debt = total - paid;
  let status = 'open';
  if (debt <= 0) status = 'paid';
  else if (paid > 0) status = 'partial';
  return {
    paid: paid,
    debt: debt,
    status: status,
    backfill: allocCount === 0 && paidNow > 0 ? paidNow : 0,
  };
}

function redact(text, secret) {
  const raw = String(text || '');
  const hidden = String(secret || '');
  if (!hidden) return raw;
  return raw.split(hidden).join('[redacted]');
}

module.exports = {
  TZ: TZ,
  whole: whole,
  tashkentYmd: tashkentYmd,
  daysBetween: daysBetween,
  formatSom: formatSom,
  formatDmy: formatDmy,
  truthy: truthy,
  reminderDecision: reminderDecision,
  buildReminderText: buildReminderText,
  safeEqual: safeEqual,
  signCallback: signCallback,
  readCallback: readCallback,
  checkoutLink: checkoutLink,
  customerKeyboard: customerKeyboard,
  amountKeyboard: amountKeyboard,
  adminKeyboard: adminKeyboard,
  parseSom: parseSom,
  settleMoney: settleMoney,
  redact: redact,
};
