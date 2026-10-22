/**
 * Yuk xati summalari. Mijoz yuborgan jami/qarz/subtotal ishonilmaydi.
 * Pul — butun so'm (ERP dagi kabi).
 *
 * Komissiya yig'ilgan pul ulushida tan olinadi:
 *   ulush = potential * yig'ilgan / yuk_jami
 * Komissiya hali yoqilmagan kunda yig'ilgan ulush keyin qo'shilmaydi.
 * Oxirgi to'lovda faqat 2 so'mgacha yaxlitlash qoldig'i qo'shiladi.
 */

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

function allocateDebtPayment(openWaybills, amount, options) {
  const opts = options || {};
  const allowed = opts.allowed !== false;
  const leftStart = som(amount);
  if (!(leftStart > 0)) return { error: 'Summa musbat bo\'lishi kerak' };
  const rows = (openWaybills || []).slice().sort(function (a, b) {
    const da = String(a.created_at || '');
    const db = String(b.created_at || '');
    if (da !== db) return da < db ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
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
};
