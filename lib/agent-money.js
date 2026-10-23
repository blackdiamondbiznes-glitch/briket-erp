/**
 * Yuk xati summalari. Mijoz yuborgan jami/qarz/subtotal ishonilmaydi.
 * Pul — butun so'm (ERP dagi kabi).
 *
 * Komissiya yig'ilgan pul ulushida tan olinadi:
 *   ulush = potential * yig'ilgan / yuk_jami
 * Komissiya hali yoqilmagan kunda yig'ilgan ulush keyin qo'shilmaydi.
 * Oxirgi to'lovda faqat 2 so'mgacha yaxlitlash qoldig'i qo'shiladi.
 */

const { creatorLabel } = require('./yuk-creator');

function num(v, def) {
  if (def === undefined) def = 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function som(v, def) {
  return Math.round(num(v, def));
}

function pieceQty(v) {
  const q = num(v);
  if (q <= 0) return 0;
  const r = Math.round(q);
  if (Math.abs(q - r) < 0.0001) return r;
  return Math.round(q * 100) / 100;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function dateOnly(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function commissionAllowed(agent, todayStr) {
  const start = dateOnly(agent && agent.commission_enabled_on);
  if (!start) return true;
  const today = dateOnly(todayStr) || String(todayStr || '').slice(0, 10);
  return today >= start;
}

function commissionOnCollection(input) {
  const potential = som(input.potential);
  const alreadyEarned = som(input.alreadyEarned);
  const collected = som(input.collected);
  const originalTotal = som(input.originalTotal);
  if (!input.allowed) return 0;
  const remaining = Math.max(0, potential - alreadyEarned);
  if (remaining <= 0 || collected <= 0 || originalTotal <= 0) return 0;
  const share = Math.min(remaining, som((potential * collected) / originalTotal));
  if (input.clearsRemainder) {
    const gap = remaining - share;
    if (gap <= 2) return remaining;
  }
  return share;
}

function waybillStatus(paid, debt) {
  const p = som(paid);
  const d = som(debt);
  if (d <= 0) return 'paid';
  if (p > 0) return 'partial';
  return 'open';
}

function buildWaybillDraft(body, productById) {
  const rawItems = body && Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw httpError(400, 'items bo\'sh bo\'lmasin');
  const items = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i] || {};
    const product = productById.get(String(it.product_id));
    if (!product || product.is_active === false) {
      throw httpError(400, 'Mahsulot topilmadi');
    }
    const quantity = pieceQty(it.quantity != null ? it.quantity : it.qty);
    if (!(quantity > 0)) throw httpError(400, 'Miqdor musbat bo\'lishi kerak');
    const hasPrice = it.price != null && it.price !== '';
    const price = hasPrice ? som(it.price) : som(product.price);
    if (price < 0) throw httpError(400, 'Narx manfiy bo\'lmasin');
    const subtotal = som(price * quantity);
    const commission = som(it.commission || 0);
    if (commission < 0) throw httpError(400, 'Komissiya manfiy bo\'lmasin');
    if (commission > subtotal) throw httpError(400, 'Komissiya qator summasidan oshmasin');
    items.push({
      product_id: product.id,
      product_name: product.sku,
      quantity: quantity,
      price: price,
      subtotal: subtotal,
      commission: commission,
    });
  }
  const total = som(items.reduce((s, it) => s + it.subtotal, 0));
  const requestedPaid = som(body.paid_amount || 0);
  if (requestedPaid < 0) throw httpError(400, 'To\'lov manfiy bo\'lmasin');
  if (requestedPaid > total) throw httpError(400, 'To\'lov jami summadan oshmasin');
  const debt = som(total - requestedPaid);
  const commissionTotal = som(items.reduce((s, it) => s + it.commission, 0));
  let due = null;
  if (body.due_date != null && body.due_date !== '') {
    due = dateOnly(body.due_date);
    if (!due) throw httpError(400, 'due_date YYYY-MM-DD bo\'lishi kerak');
  }
  let note = null;
  if (body.note != null && String(body.note).trim()) {
    note = String(body.note).trim();
    if (note.length > 2000) throw httpError(400, 'Izoh juda uzun');
  }
  return {
    items: items,
    total_amount: total,
    paid_amount: requestedPaid,
    debt_amount: debt,
    commission_amount: commissionTotal,
    due_date: due,
    note: note,
    status: waybillStatus(requestedPaid, debt),
  };
}

function saleDateKey(row) {
  return dateOnly(row && row.sale_date) || '';
}

/** Eng eski ochiq yuk xati: sale_date, keyin id. created_at ishlatilmaydi. */
function compareBySaleDate(a, b) {
  const da = saleDateKey(a) || '9999-12-31';
  const db = saleDateKey(b) || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return Number(a.id) - Number(b.id);
}

function tashkentToday(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date || new Date());
}

function addDaysYmd(ymd, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + Number(days) || 0);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return y + '-' + mo + '-' + d;
}

function formatDmy(value) {
  const s = dateOnly(value) || String(value || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return '';
  return m[3] + '.' + m[2] + '.' + m[1];
}

function strictSom(v, label) {
  if (v == null || v === '') throw httpError(400, label + ' kerak');
  if (typeof v === 'string' && !/^-?\d+(\.0+)?$/.test(v.trim())) {
    throw httpError(400, label + ' butun so\'m bo\'lishi kerak');
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw httpError(400, label + ' son bo\'lishi kerak');
  if (Math.abs(n - Math.round(n)) > 1e-6) throw httpError(400, label + ' butun so\'m bo\'lishi kerak');
  return Math.round(n);
}

function strictQty(v) {
  if (v == null || v === '') throw httpError(400, 'Miqdor kerak');
  if (typeof v === 'string' && !/^\d+$/.test(v.trim())) {
    throw httpError(400, 'Miqdor musbat butun son bo\'lishi kerak');
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'Miqdor musbat butun son bo\'lishi kerak');
  return n;
}

function assertSaleDate(saleDate, todayStr) {
  const s = dateOnly(saleDate);
  const today = dateOnly(todayStr);
  if (!s) throw httpError(400, 'Sana noto\'g\'ri');
  if (!today) throw httpError(400, 'Bugungi sana yo\'q');
  if (s > today) throw httpError(400, 'Sana kelajakda bo\'lmasin');
  const min = addDaysYmd(today, -90);
  if (s < min) throw httpError(400, 'Sana 90 kundan eski bo\'lmasin');
  return s;
}

function assertDueDate(due, saleDate, debt) {
  if (!(som(debt) > 0)) {
    if (due == null || due === '') return null;
  }
  if (due == null || due === '') throw httpError(400, 'Qarz uchun muddat kerak');
  const d = dateOnly(due);
  if (!d) throw httpError(400, 'due_date YYYY-MM-DD bo\'lishi kerak');
  const sale = dateOnly(saleDate);
  if (sale && d < sale) throw httpError(400, 'Muddat sotuv sanasidan oldin bo\'lmasin');
  return d;
}

function buildOwnerDraft(body, productById) {
  const rawItems = body && Array.isArray(body.items) ? body.items : [];
  const active = rawItems.filter(function (it) {
    const q = it && (it.quantity != null ? it.quantity : it.qty);
    return Number(q) > 0;
  });
  if (!active.length) throw httpError(400, 'Mahsulot tanlanmagan');
  const confirmZero = !!(body && body.confirm_zero_price === true);
  const items = [];
  for (let i = 0; i < active.length; i++) {
    const it = active[i] || {};
    const product = productById.get(String(it.product_id));
    if (!product || product.is_active === false) throw httpError(400, 'Mahsulot topilmadi');
    const quantity = strictQty(it.quantity != null ? it.quantity : it.qty);
    const hasPrice = it.price != null && it.price !== '';
    const price = strictSom(hasPrice ? it.price : product.price, 'Narx');
    if (price < 0) throw httpError(400, 'Narx manfiy bo\'lmasin');
    if (price === 0 && !confirmZero) throw httpError(400, 'Narx 0. Tasdiqlang yoki narx kiriting');
    const subtotal = price * quantity;
    items.push({
      product_id: product.id,
      product_name: product.sku,
      quantity: quantity,
      price: price,
      subtotal: subtotal,
      commission: 0,
    });
  }
  const total = items.reduce(function (s, it) { return s + it.subtotal; }, 0);
  return {
    items: items,
    total_amount: total,
    commission_amount: 0,
  };
}

/**
 * To'lovni eng eski ochiq yuk xatiga (sale_date, id) taqsimlaydi.
 * Qolgani kredit. created_at ishlatilmaydi.
 * Agent yo'li allocateDebtPayment ortiqchani rad etadi.
 */
function allocateBySaleDate(openWaybills, amount) {
  const leftStart = som(amount);
  if (!(leftStart > 0)) return { error: 'Summa musbat bo\'lishi kerak' };
  const rows = (openWaybills || []).slice().sort(compareBySaleDate);
  let left = leftStart;
  const allocations = [];
  for (let i = 0; i < rows.length && left > 0; i++) {
    const w = rows[i];
    const debt = som(w.debt_amount);
    if (debt <= 0) continue;
    const take = Math.min(debt, left);
    allocations.push({
      waybill_id: w.id,
      amount: take,
      sale_date: saleDateKey(w) || null,
    });
    left -= take;
  }
  return { allocations: allocations, applied: leftStart - left, credit: left };
}

function formatSom(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatYukXati(doc, company) {
  const co = company || {};
  const items = (doc && doc.items) || [];
  const lines = [];
  lines.push('Yuk xati ' + (doc.waybill_code || ''));
  if (co.name) lines.push(String(co.name));
  lines.push('Sana: ' + (formatDmy(doc.sale_date || doc.created_at) || ''));
  lines.push('Yozgan: ' + creatorLabel(doc));
  lines.push('Do\'kon: ' + (doc.customer_name || ''));
  if (doc.customer_phone) lines.push('Tel: ' + doc.customer_phone);
  if (doc.customer_address) lines.push('Manzil: ' + doc.customer_address);
  lines.push('');
  items.forEach(function (it) {
    lines.push(
      (it.product_name || '') +
        '  x' +
        it.quantity +
        '  × ' +
        formatSom(it.price) +
        '  = ' +
        formatSom(it.subtotal)
    );
  });
  lines.push('');
  lines.push('Jami: ' + formatSom(doc.total_amount) + ' so\'m');
  lines.push('Naqd: ' + formatSom(doc.paid_cash || 0));
  lines.push('Karta: ' + formatSom(doc.paid_card || 0));
  lines.push('To\'langan: ' + formatSom(doc.paid_amount));
  lines.push('Qarz: ' + formatSom(doc.debt_amount));
  if (som(doc.debt_amount) > 0 && doc.due_date) lines.push('Muddat: ' + formatDmy(doc.due_date));
  if (som(doc.credit_written) > 0) {
    lines.push('Do\'kon krediti: ' + formatSom(doc.credit_written) + ' so\'m');
  }
  if (co.card) {
    lines.push('');
    lines.push('Karta: ' + co.card);
    if (co.card_holder) lines.push(String(co.card_holder));
  }
  if (co.phone) lines.push('Tel: ' + co.phone);
  return lines.join('\n');
}

function allocateDebtPayment(openWaybills, amount, options) {
  const opts = options || {};
  const allowed = opts.allowed !== false;
  const leftStart = som(amount);
  if (!(leftStart > 0)) return { error: 'Summa musbat bo\'lishi kerak' };
  const rows = (openWaybills || []).slice().sort(compareBySaleDate);
  const totalDebt = som(rows.reduce((s, w) => s + Math.max(0, som(w.debt_amount)), 0));
  if (leftStart > totalDebt) return { error: 'Summa qarzdan oshib ketdi' };
  let left = leftStart;
  const allocations = [];
  for (let i = 0; i < rows.length && left > 0; i++) {
    const w = rows[i];
    const debt = som(w.debt_amount);
    if (debt <= 0) continue;
    const take = Math.min(debt, left);
    const commission = commissionOnCollection({
      potential: w.commission_amount,
      alreadyEarned: w.commission_earned,
      collected: take,
      originalTotal: w.total_amount,
      allowed: allowed,
      clearsRemainder: take === debt,
    });
    allocations.push({
      waybill_id: w.id,
      amount: take,
      commission_amount: commission,
    });
    left -= take;
  }
  return { allocations: allocations, applied: leftStart - left };
}

module.exports = {
  num: num,
  som: som,
  pieceQty: pieceQty,
  httpError: httpError,
  dateOnly: dateOnly,
  commissionAllowed: commissionAllowed,
  commissionOnCollection: commissionOnCollection,
  waybillStatus: waybillStatus,
  buildWaybillDraft: buildWaybillDraft,
  allocateDebtPayment: allocateDebtPayment,
  saleDateKey: saleDateKey,
  compareBySaleDate: compareBySaleDate,
  tashkentToday: tashkentToday,
  addDaysYmd: addDaysYmd,
  formatDmy: formatDmy,
  strictSom: strictSom,
  strictQty: strictQty,
  assertSaleDate: assertSaleDate,
  assertDueDate: assertDueDate,
  buildOwnerDraft: buildOwnerDraft,
  allocateBySaleDate: allocateBySaleDate,
  formatSom: formatSom,
  formatYukXati: formatYukXati,
};
