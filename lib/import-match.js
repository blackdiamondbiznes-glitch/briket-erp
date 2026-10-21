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

function interpretStoreDebt(orders, payments) {
  const orderRows = orders || [];
  const payRows = payments || [];
  const stored = round2(orderRows.reduce((s, o) => s + num(o.debt_amount), 0));
  const reconstructed = round2(
    orderRows.reduce((s, o) => s + (num(o.total_amount) - num(o.paid_amount)), 0)
  );
  const paymentsSum = round2(payRows.reduce((s, p) => s + num(p.amount), 0));
  const storedVsReconstructed = round2(stored - reconstructed);
  let interpretation = 'mismatch';
  let appliedToWaybills = false;
  if (Math.abs(stored - reconstructed) <= 0.01) {
    interpretation = 'debt_is_unpaid_at_sale_payments_separate';
    appliedToWaybills = false;
  } else if (Math.abs(stored - (reconstructed - paymentsSum)) <= 0.01) {
    interpretation = 'debt_already_includes_payments';
    appliedToWaybills = true;
  }
  return {
    stored_debt: stored,
    reconstructed_unpaid: reconstructed,
    payments_sum: paymentsSum,
    stored_minus_reconstructed: storedVsReconstructed,
    stored_minus_payments: round2(stored - paymentsSum),
    interpretation: interpretation,
    applied_to_waybills: appliedToWaybills,
    needs_review: interpretation === 'mismatch' || Math.abs(storedVsReconstructed) > 0.01,
  };
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
    if (linked) {
      actions.push({ type: 'link_customer', store_id: sid, customer_id: Number(linked) });
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
    const hits = erpProducts.filter((p) => normalizeName(p.sku || p.name) === want && want);
    if (hits.length === 1) {
      actions.push({ type: 'link_product', legacy_id: pid, product_id: hits[0].id, via: 'sku' });
    } else {
      productUnmatched.push({
        legacy_id: pid,
        name: product.name || '',
        matches: hits.map((h) => h.id),
      });
      actions.push({ type: 'skip_product', legacy_id: pid, reason: hits.length ? 'ambiguous' : 'no_match' });
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

  return {
    legacy_source: LEGACY_SOURCE,
    duplicates: duplicates,
    debts: debts,
    product_unmatched: productUnmatched,
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
}

module.exports = {
  LEGACY_SOURCE: LEGACY_SOURCE,
  normalizeName: normalizeName,
  normalizePhone: normalizePhone,
  duplicateCandidates: duplicateCandidates,
  interpretStoreDebt: interpretStoreDebt,
  buildImportPlan: buildImportPlan,
};
