/**
 * Mini-app importini rejalash. Bazaga yozmaydi.
 * legacy uuid -> ERP id bog'lash odam tasdig'isiz dublikatni birlashtirmaydi.
 */

const LEGACY_SOURCE = 'briket-mini-app';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function kgFromName(name) {
  const text = String(name || '').replace(/,/g, '.');
  const found = text.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (!found) return null;
  const n = Number(found[1]);
  return Number.isFinite(n) ? n : null;
}

function sameWeight(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 0.001;
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[''`ʻʼ′]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00998')) d = d.slice(2);
  if (d.startsWith('998') && d.length === 12) return d;
  if (d.length === 9) return '998' + d;
  return d;
}

function phonesMatch(a, b) {
  const pa = normalizePhone(a);
  const pb = normalizePhone(b);
  return !!(pa && pb && pa === pb);
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return !!(na && nb && na.length >= 3 && na === nb);
}

function pairReason(left, right) {
  const phoneHit = phonesMatch(left.phone, right.phone);
  const nameHit = namesMatch(left.name, right.name);
  if (phoneHit && nameHit) return 'name+phone';
  if (phoneHit) return 'phone';
  if (nameHit) return 'name';
  return '';
}

function duplicateCandidates(stores, erpCustomers) {
  const list = stores || [];
  const customers = erpCustomers || [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const store = list[i];
    for (let j = 0; j < customers.length; j++) {
      const customer = customers[j];
      if (String(customer.legacy_id || '') === String(store.id) && sameLegacy(customer.legacy_source)) continue;
      const reason = pairReason(store, customer);
      if (!reason) continue;
      out.push({
        kind: 'erp',
        store_id: String(store.id),
        store_name: store.name || '',
        store_phone: store.phone || '',
        customer_id: customer.id,
        customer_name: customer.name || '',
        customer_phone: customer.phone || '',
        reason: reason,
      });
    }
    for (let k = i + 1; k < list.length; k++) {
      const other = list[k];
      const reason = pairReason(store, other);
      if (!reason) continue;
      out.push({
        kind: 'mini',
        store_id: String(store.id),
        store_name: store.name || '',
        store_phone: store.phone || '',
        other_store_id: String(other.id),
        other_store_name: other.name || '',
        other_store_phone: other.phone || '',
        reason: reason,
      });
    }
  }
  return out;
}

function wholeSom(v) {
  return Math.round(num(v));
}

function byTimeThenId(a, b) {
  const at = String(a.created_at || '');
  const bt = String(b.created_at || '');
  if (at < bt) return -1;
  if (at > bt) return 1;
  return num(a.id) - num(b.id);
}

function moneyStatus(paid, debt) {
  if (debt <= 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'open';
}

function interpretStoreDebt(orders, payments) {
  const orderRows = orders || [];
  const payRows = payments || [];
  const stored = round2(orderRows.reduce((s, o) => s + num(o.debt_amount), 0));
  const reconstructed = round2(
    orderRows.reduce((s, o) => s + (num(o.total_amount) - num(o.paid_amount)), 0)
  );
  const paymentsSum = round2(payRows.reduce((s, p) => s + num(p.amount), 0));
  const storedVsReconstructed = round2(stored - reconstructed);
  const invariant = Math.abs(storedVsReconstructed) <= 0.01;
  let interpretation = 'mismatch';
  if (invariant) interpretation = 'paid_includes_applied_payments';
  else if (Math.abs(stored - (reconstructed - paymentsSum)) <= 0.01) {
    interpretation = 'debt_already_includes_payments';
  }
  return {
    stored_debt: stored,
    reconstructed_unpaid: reconstructed,
    payments_sum: paymentsSum,
    stored_minus_reconstructed: storedVsReconstructed,
    stored_minus_payments: round2(stored - paymentsSum),
    remaining_debt: stored,
    interpretation: interpretation,
    applied_to_waybills: interpretation !== 'mismatch',
    needs_review: !invariant,
  };
}

function mergeAlloc(list, row) {
  const key = row.payment_legacy_id + '|' + row.order_legacy_id;
  const found = list.find(function (item) {
    return item.payment_legacy_id + '|' + item.order_legacy_id === key;
  });
  if (found) found.amount += row.amount;
  else list.push(row);
}

/**
 * Bitta to'lov bitta yuk xatiga bitta qator.
 * Tuzatilgan paid = max(mini paid, bazadagi allocation + yangi qator), totaldan oshmaydi.
 * Sig'im = shu yangi paid − bazadagi allocation. To'liq taqsimlangan to'lov qayta yozilmaydi.
 */
function planStoreMoney(orders, payments, options) {
  const opts = options || {};
  const allocatedByOrder = opts.allocatedByOrder || {};
  const allocatedByPayment = opts.allocatedByPayment || {};
  const rows = (orders || []).slice().sort(byTimeThenId).map(function (order) {
    const total = Math.max(wholeSom(order.total_amount), wholeSom(order.paid_amount) + wholeSom(order.debt_amount));
    const db = Math.min(total, wholeSom(allocatedByOrder[String(order.id)] || 0));
    return {
      legacy_id: String(order.id),
      total: total,
      miniPaid: wholeSom(order.paid_amount),
      db: db,
      add: 0,
    };
  });
  const allocations = [];
  (payments || []).slice().sort(byTimeThenId).forEach(function (pay) {
    const already = wholeSom(allocatedByPayment[String(pay.id)] || 0);
    let left = wholeSom(pay.amount) - already;
    if (left <= 0) return;
    rows.forEach(function (row) {
      if (left <= 0) return;
      const paidIfTaken = Math.min(row.total, Math.max(row.miniPaid, row.db + row.add + left));
      const cap = Math.max(0, paidIfTaken - row.db - row.add);
      const take = Math.min(left, cap);
      if (take <= 0) return;
      row.add += take;
      left -= take;
      mergeAlloc(allocations, {
        payment_legacy_id: String(pay.id),
        order_legacy_id: row.legacy_id,
        amount: take,
      });
    });
  });
  return {
    orders: rows.map(function (row) {
      const paid = Math.min(row.total, Math.max(row.miniPaid, row.db + row.add));
      const debt = Math.max(0, row.total - paid);
      return {
        legacy_id: row.legacy_id,
        paid_amount: paid,
        debt_amount: debt,
        status: moneyStatus(paid, debt),
      };
    }),
    allocations: allocations,
  };
}

function planLegacyMoney(orders, payments, options) {
  const byStoreOrders = {};
  const byStorePays = {};
  (orders || []).forEach(function (order) {
    const sid = String(order.store_id);
    if (!byStoreOrders[sid]) byStoreOrders[sid] = [];
    byStoreOrders[sid].push(order);
  });
  (payments || []).forEach(function (pay) {
    const sid = String(pay.store_id);
    if (!byStorePays[sid]) byStorePays[sid] = [];
    byStorePays[sid].push(pay);
  });
  const ids = {};
  Object.keys(byStoreOrders).forEach(function (sid) { ids[sid] = true; });
  Object.keys(byStorePays).forEach(function (sid) { ids[sid] = true; });
  const byOrder = {};
  const allocations = [];
  Object.keys(ids).forEach(function (sid) {
    const planned = planStoreMoney(byStoreOrders[sid] || [], byStorePays[sid] || [], options);
    planned.orders.forEach(function (row) { byOrder[row.legacy_id] = row; });
    planned.allocations.forEach(function (row) { allocations.push(row); });
  });
  return { byOrder: byOrder, allocations: allocations };
}

function legacyWaybillCode(legacyId) {
  return 'YX-LEG-' + String(legacyId);
}

function paymentNote(legacyId) {
  return 'Yuk tarqatish tarix ' + String(legacyId);
}

function sameLegacy(source) {
  const src = source == null ? '' : String(source);
  return !src || src === LEGACY_SOURCE;
}

function takenWaybills(erp) {
  const set = {};
  (erp.waybills || []).forEach(function (row) {
    const code = String(row.waybill_code || '');
    if (code.indexOf('YX-LEG-') === 0) set[code.slice('YX-LEG-'.length)] = true;
    if (row.legacy_id != null && String(row.legacy_id) !== '' && sameLegacy(row.legacy_source)) {
      set[String(row.legacy_id)] = true;
    }
  });
  return set;
}

function takenPayments(erp) {
  const set = {};
  const prefix = 'Yuk tarqatish tarix ';
  (erp.agent_debt_payments || []).forEach(function (row) {
    if (row.legacy_id == null || String(row.legacy_id) === '') return;
    if (sameLegacy(row.legacy_source)) set[String(row.legacy_id)] = true;
  });
  (erp.payments || []).forEach(function (row) {
    const note = String(row.note || '');
    if (note.indexOf(prefix) !== 0) return;
    const id = note.slice(prefix.length);
    if (!id || !sameLegacy(row.legacy_source)) return;
    set[id] = true;
  });
  return set;
}

function takenCustomers(erp) {
  const set = {};
  (erp.customers || []).forEach(function (row) {
    if (row.legacy_id == null || String(row.legacy_id) === '') return;
    if (sameLegacy(row.legacy_source)) set[String(row.legacy_id)] = true;
  });
  return set;
}

function incrementalDelta(mini, erp, plan) {
  const haveWaybills = takenWaybills(erp || {});
  const havePayments = takenPayments(erp || {});
  const haveCustomers = takenCustomers(erp || {});
  const skippedStores = {};
  ((plan && plan.actions) || []).forEach(function (action) {
    if (action.type === 'skip_customer') skippedStores[action.store_id] = true;
  });
  let newWaybills = 0;
  let newPayments = 0;
  let newCustomers = 0;
  (mini.orders || []).forEach(function (order) {
    const sid = String(order.store_id);
    if (skippedStores[sid]) return;
    if (haveWaybills[String(order.id)]) return;
    newWaybills += 1;
  });
  (mini.debt_payments || []).forEach(function (pay) {
    const sid = String(pay.store_id);
    if (skippedStores[sid]) return;
    if (havePayments[String(pay.id)]) return;
    newPayments += 1;
  });
  ((plan && plan.actions) || []).forEach(function (action) {
    if (action.type === 'create_customer' && !haveCustomers[String(action.store_id)]) newCustomers += 1;
  });
  return {
    new_waybills: newWaybills,
    new_payments: newPayments,
    new_customers: newCustomers,
  };
}

function reconcileOrders(orders, debts) {
  const planned = planLegacyMoney(orders, []);
  const out = {};
  (orders || []).forEach(function (order) {
    const row = planned.byOrder[String(order.id)];
    out[String(order.id)] = row || {
      paid_amount: wholeSom(order.paid_amount),
      debt_amount: wholeSom(order.debt_amount),
      status: moneyStatus(wholeSom(order.paid_amount), wholeSom(order.debt_amount)),
    };
  });
  void debts;
  return out;
}

function buildImportPlan(mini, erp, links) {
  const src = mini || {};
  const dest = erp || {};
  const linkFile = links || {};
  const storeLinks = linkFile.stores || {};
  const productLinks = linkFile.products || {};
  const stores = src.stores || [];
  const profiles = src.profiles || [];
  const orders = src.orders || [];
  const payments = src.debt_payments || [];
  const products = src.products || [];
  const erpCustomers = dest.customers || [];
  const erpProducts = dest.products || [];
  const duplicates = duplicateCandidates(stores, erpCustomers);
  const dupStoreIds = {};
  duplicates.forEach(function (d) {
    if (d.kind === 'erp') dupStoreIds[String(d.store_id)] = true;
  });

  const debts = [];
  stores.forEach(function (store) {
    const sid = String(store.id);
    const report = interpretStoreDebt(
      orders.filter((o) => String(o.store_id) === sid),
      payments.filter((p) => String(p.store_id) === sid)
    );
    debts.push(Object.assign({ store_id: sid, store_name: store.name || '' }, report));
  });

  const actions = [];
  profiles.forEach(function (profile) {
    actions.push({ type: 'upsert_agent', legacy_id: String(profile.id), telegram_id: profile.telegram_id });
  });
  (src.access_requests || []).forEach(function (row) {
    actions.push({ type: 'insert_access_request', legacy_id: String(row.id) });
  });

  stores.forEach(function (store) {
    const sid = String(store.id);
    const linked = storeLinks[sid] || storeLinks[store.id];
    const already = erpCustomers.find(function (customer) {
      return String(customer.legacy_id || '') === sid && sameLegacy(customer.legacy_source);
    });
    if (linked) {
      actions.push({ type: 'link_customer', store_id: sid, customer_id: Number(linked) });
    } else if (already) {
      actions.push({ type: 'use_customer', store_id: sid, customer_id: Number(already.id) });
    } else if (dupStoreIds[sid]) {
      actions.push({ type: 'skip_customer', store_id: sid, reason: 'duplicate' });
    } else {
      actions.push({ type: 'create_customer', store_id: sid });
    }
  });

  const productUnmatched = [];
  products.forEach(function (product) {
    const pid = String(product.id);
    const linked = productLinks[pid] || productLinks[product.id];
    if (linked) {
      actions.push({ type: 'link_product', legacy_id: pid, product_id: Number(linked) });
      return;
    }
    const want = normalizeName(product.name);
    const skuHits = erpProducts.filter((p) => normalizeName(p.sku) === want && want);
    const kg = kgFromName(product.name);
    const weightHits = kg == null
      ? []
      : erpProducts.filter((p) => sameWeight(p.weight_kg, kg));
    if (skuHits.length === 1) {
      actions.push({ type: 'link_product', legacy_id: pid, product_id: skuHits[0].id, via: 'sku' });
    } else if (weightHits.length === 1) {
      actions.push({ type: 'link_product', legacy_id: pid, product_id: weightHits[0].id, via: 'weight' });
    } else {
      const hits = skuHits.length ? skuHits : weightHits;
      productUnmatched.push({
        legacy_id: pid,
        name: product.name || '',
        kg: kg,
        matches: hits.map((h) => h.id),
      });
      actions.push({
        type: 'skip_product',
        legacy_id: pid,
        reason: skuHits.length > 1 || weightHits.length > 1 ? 'ambiguous' : 'no_match',
      });
    }
  });

  const skippedStores = {};
  actions.forEach(function (a) {
    if (a.type === 'skip_customer') skippedStores[a.store_id] = true;
  });
  orders.forEach(function (order) {
    const sid = String(order.store_id);
    if (skippedStores[sid]) {
      actions.push({ type: 'skip_waybill', legacy_id: String(order.id), reason: 'store_not_mapped' });
    } else {
      actions.push({ type: 'create_waybill', legacy_id: String(order.id), store_id: sid });
    }
  });

  const plan = {
    legacy_source: LEGACY_SOURCE,
    duplicates: duplicates,
    debts: debts,
    product_unmatched: productUnmatched,
    erp_products: erpProducts.map(function (p) {
      return {
        id: p.id,
        sku: p.sku || '',
        weight_kg: p.weight_kg == null || p.weight_kg === '' ? null : Number(p.weight_kg),
      };
    }),
    actions: actions,
    counts: {
      profiles: profiles.length,
      stores: stores.length,
      duplicate_pairs: duplicates.length,
      debt_reviews: debts.filter((d) => d.needs_review).length,
      skipped_stores: Object.keys(skippedStores).length,
      unmatched_products: productUnmatched.length,
    },
  };
  plan.delta = incrementalDelta(src, dest, plan);
  plan.legacy_money = planLegacyMoney(orders, payments);
  return plan;
}

module.exports = {
  LEGACY_SOURCE: LEGACY_SOURCE,
  normalizeName: normalizeName,
  kgFromName: kgFromName,
  normalizePhone: normalizePhone,
  duplicateCandidates: duplicateCandidates,
  interpretStoreDebt: interpretStoreDebt,
  reconcileOrders: reconcileOrders,
  planStoreMoney: planStoreMoney,
  planLegacyMoney: planLegacyMoney,
  buildImportPlan: buildImportPlan,
  legacyWaybillCode: legacyWaybillCode,
  paymentNote: paymentNote,
  incrementalDelta: incrementalDelta,
};
