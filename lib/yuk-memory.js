/**
 * Egasi yuk xati — xotira ombori. SQL bilan bir xil metodlar.
 * Test production bazasiga tegmaydi.
 */

function same(a, b) {
  return String(a) === String(b);
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
}

function attachYukMemory(api, state, next) {
  if (!state.ledger) state.ledger = [];
  if (!state.ledgerAlloc) state.ledgerAlloc = [];
  if (!state.storeCredits) state.storeCredits = [];
  if (!state.settings) state.settings = {};
  api.settings = state.settings;
  Object.defineProperty(api, 'ledger', { get: function () { return state.ledger; }, enumerable: false });
  Object.defineProperty(api, 'ledgerAlloc', { get: function () { return state.ledgerAlloc; }, enumerable: false });
  Object.defineProperty(api, 'waybills', { get: function () { return state.waybills; }, enumerable: false });
  Object.defineProperty(api, 'customers', { get: function () { return state.customers; }, enumerable: false });
  if (!state.seq.ledger) state.seq.ledger = 1;
  if (!state.seq.ledgerAlloc) state.seq.ledgerAlloc = 1;
  if (!state.seq.storeCredit) state.seq.storeCredit = 1;
  if (!state.seq.waybillCode) state.seq.waybillCode = 1;

  function ownerWaybills() {
    return state.waybills.filter(function (w) { return w.agent_id == null; });
  }

  function debtOf(customerId) {
    return ownerWaybills()
      .filter(function (w) { return same(w.customer_id, customerId); })
      .reduce(function (s, w) { return s + n(w.debt_amount); }, 0);
  }

  function creditOf(customerId) {
    return state.storeCredits
      .filter(function (s) { return same(s.customer_id, customerId); })
      .reduce(function (s, row) { return s + n(row.amount); }, 0);
  }

  function paidSplit(waybillId) {
    let cash = 0;
    let card = 0;
    state.ledgerAlloc.forEach(function (a) {
      if (!same(a.waybill_id, waybillId)) return;
      const pay = state.ledger.find(function (p) { return same(p.id, a.payment_id); });
      if (!pay) return;
      if (pay.kind !== 'collection' && pay.kind !== 'reversal' && pay.kind !== 'backfill') return;
      if (pay.method === 'card') card += n(a.amount);
      else cash += n(a.amount);
    });
    return { paid_cash: cash, paid_card: card };
  }

  function withItems(waybill) {
    const customer = state.customers.find(function (c) { return same(c.id, waybill.customer_id); });
    const split = paidSplit(waybill.id);
    return Object.assign({}, waybill, split, {
      customer_name: customer ? customer.name : waybill.customer_name || null,
      customer_phone: customer ? customer.phone : null,
      customer_address: customer ? customer.address : null,
      items: state.items.filter(function (it) { return same(it.waybill_id, waybill.id); }),
      paid_amount: n(waybill.paid_amount),
      debt_amount: n(waybill.debt_amount),
      total_amount: n(waybill.total_amount),
    });
  }

  function decorateCustomer(c) {
    const debt = debtOf(c.id);
    const credit = creditOf(c.id);
    return Object.assign({}, c, {
      debt_amount: debt,
      store_credit: credit,
      outstanding: Math.max(0, debt - credit),
    });
  }

  api.lockOwnerCustomer = async function (customerId) {
    const row = state.customers.find(function (c) {
      return same(c.id, customerId) && c.agent_id == null;
    });
    return row ? Object.assign({}, row) : null;
  };

  api.listOwnerCustomers = async function (query) {
    const q = String(query || '').trim().toLowerCase();
    return state.customers
      .filter(function (c) {
        if (c.agent_id != null || c.is_active === false) return false;
        if (!q) return true;
        const blob = [c.name, c.phone, c.address].join(' ').toLowerCase();
        return blob.indexOf(q) !== -1;
      })
      .map(decorateCustomer)
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  };

  api.insertOwnerCustomer = async function (fields) {
    const created = {
      id: next('customer'),
      name: fields.name,
      phone: fields.phone || null,
      address: fields.address || null,
      latitude: fields.latitude != null ? fields.latitude : null,
      longitude: fields.longitude != null ? fields.longitude : null,
      note: fields.note || 'Yuk xati do\'koni',
      agent_id: null,
      is_active: true,
      legacy_source: null,
    };
    state.customers.push(created);
    return decorateCustomer(created);
  };

  api.insertProduct = async function (row) {
    const created = {
      id: row.id != null ? row.id : state.products.length + 1,
      sku: row.sku,
      price: row.price,
      is_active: row.is_active !== false,
      weight_kg: row.weight_kg || 1,
    };
    state.products.push(created);
    return created;
  };

  api.findOwnerWaybillByRequestId = async function (requestId) {
    if (!requestId) return null;
    const row = state.waybills.find(function (w) {
      return w.request_id && same(w.request_id, requestId) && w.agent_id == null;
    });
    return row ? withItems(row) : null;
  };

  api.nextWaybillCode = async function (saleDate) {
    const seq = state.seq.waybillCode;
    state.seq.waybillCode += 1;
    const day = String(saleDate || '').replace(/-/g, '');
    return 'YX-' + day + '-' + String(seq).padStart(6, '0');
  };

  api.insertOwnerWaybill = async function (input) {
    const d = input.draft;
    if (input.requestId && state.waybills.some(function (w) { return w.request_id && same(w.request_id, input.requestId); })) {
      const err = new Error('request_id band');
      err.code = '23505';
      throw err;
    }
    const waybill = {
      id: next('waybill'),
      waybill_code: input.code,
      agent_id: null,
      customer_id: input.customerId,
      total_amount: d.total_amount,
      paid_amount: 0,
      debt_amount: d.total_amount,
      commission_amount: 0,
      due_date: input.dueDate || null,
      status: d.total_amount > 0 ? 'open' : 'paid',
      note: input.note || null,
      idempotency_key: input.requestId || null,
      request_id: input.requestId || null,
      order_id: null,
      reys_id: input.reysId != null ? input.reysId : null,
      stock_posted: input.stockPosted === true,
      sale_date: input.saleDate,
      legacy_source: null,
      created_at: new Date().toISOString(),
      created_by_telegram_id: input.creator ? input.creator.telegramId || null : null,
      created_by_first_name: input.creator ? input.creator.firstName || null : null,
      created_by_last_name: input.creator ? input.creator.lastName || null : null,
      created_by_username: input.creator ? input.creator.username || null : null,
    };
    state.waybills.push(waybill);
    d.items.forEach(function (it) {
      state.items.push({
        id: next('item'),
        waybill_id: waybill.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price,
        subtotal: it.subtotal,
        commission: 0,
      });
    });
    return withItems(waybill);
  };

  api.lockOwnerWaybill = async function (waybillId) {
    const row = state.waybills.find(function (w) {
      return same(w.id, waybillId) && w.agent_id == null;
    });
    return row || null;
  };

  api.listOpenOwnerWaybills = async function (customerId) {
    return ownerWaybills()
      .filter(function (w) { return same(w.customer_id, customerId) && n(w.debt_amount) > 0; })
      .slice()
      .sort(function (a, b) {
        const da = String(a.sale_date || '9999-12-31');
        const db = String(b.sale_date || '9999-12-31');
        if (da !== db) return da < db ? -1 : 1;
        return Number(a.id) - Number(b.id);
      })
      .map(function (w) {
        return {
          id: w.id,
          sale_date: w.sale_date || null,
          debt_amount: n(w.debt_amount),
          total_amount: n(w.total_amount),
          paid_amount: n(w.paid_amount),
          due_date: w.due_date || null,
          waybill_code: w.waybill_code,
        };
      });
  };

  api.allocationState = async function (waybillId) {
    const rows = state.ledgerAlloc.filter(function (a) { return same(a.waybill_id, waybillId); });
    return {
      count: rows.length,
      sum: rows.reduce(function (s, a) { return s + n(a.amount); }, 0),
    };
  };

  api.setWaybillMoney = async function (waybillId, money) {
    const row = state.waybills.find(function (w) {
      return same(w.id, waybillId) && w.agent_id == null;
    });
    if (!row) return null;
    row.total_amount = money.total;
    row.paid_amount = money.paid;
    row.debt_amount = money.debt;
    row.status = money.status;
    row.due_date = money.dueDate;
    row.sale_date = money.saleDate;
    row.note = money.note;
    return row;
  };

  api.replaceOwnerItems = async function (waybillId, items) {
    state.items = state.items.filter(function (it) { return !same(it.waybill_id, waybillId); });
    const out = [];
    items.forEach(function (it) {
      const row = {
        id: next('item'),
        waybill_id: waybillId,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price,
        subtotal: it.subtotal,
        commission: 0,
      };
      state.items.push(row);
      out.push(row);
    });
    return out;
  };

  api.insertLedgerPayment = async function (input) {
    if (input.requestId && state.ledger.some(function (p) { return p.request_id && same(p.request_id, input.requestId); })) {
      const err = new Error('request_id band');
      err.code = '23505';
      throw err;
    }
    if (input.reversesPaymentId && state.ledger.some(function (p) {
      return p.reverses_payment_id && same(p.reverses_payment_id, input.reversesPaymentId);
    })) {
      const err = new Error('already reversed');
      err.code = '23505';
      throw err;
    }
    const payment = {
      id: next('ledger'),
      order_id: null,
      customer_id: input.customerId,
      amount: input.amount,
      method: input.method || 'cash',
      note: input.note || null,
      request_id: input.requestId || null,
      reverses_payment_id: input.reversesPaymentId || null,
      kind: input.kind || 'collection',
      created_at: new Date().toISOString(),
      created_by_telegram_id: input.creator ? input.creator.telegramId || null : null,
      created_by_first_name: input.creator ? input.creator.firstName || null : null,
      created_by_last_name: input.creator ? input.creator.lastName || null : null,
      created_by_username: input.creator ? input.creator.username || null : null,
    };
    state.ledger.push(payment);
    payment.allocations = [];
    (input.allocations || []).forEach(function (a) {
      if (!a || !a.amount) return;
      const row = {
        id: next('ledgerAlloc'),
        payment_id: payment.id,
        waybill_id: a.waybill_id,
        amount: a.amount,
      };
      state.ledgerAlloc.push(row);
      payment.allocations.push(row);
    });
    payment.credit = n(input.credit);
    if (payment.credit !== 0) {
      state.storeCredits.push({
        id: next('storeCredit'),
        customer_id: input.customerId,
        amount: payment.credit,
        payment_id: payment.id,
        waybill_id: input.waybillId || null,
        note: input.creditNote || input.note || null,
      });
    }
    return payment;
  };

  api.findLedgerPaymentByRequestId = async function (requestId) {
    if (!requestId) return null;
    return state.ledger.find(function (p) { return p.request_id && same(p.request_id, requestId); }) || null;
  };

  api.getLedgerPayment = async function (paymentId) {
    const payment = state.ledger.find(function (p) { return same(p.id, paymentId); });
    if (!payment) return null;
    const copy = Object.assign({}, payment, {
      amount: n(payment.amount),
      reversed: state.ledger.some(function (p) { return p.reverses_payment_id && same(p.reverses_payment_id, payment.id); }),
      allocations: state.ledgerAlloc.filter(function (a) { return same(a.payment_id, payment.id); }),
    });
    copy.credit = state.storeCredits
      .filter(function (s) { return same(s.payment_id, payment.id); })
      .reduce(function (sum, s) { return sum + n(s.amount); }, 0);
    return copy;
  };

  api.getOwnerWaybill = async function (waybillId) {
    const row = state.waybills.find(function (w) {
      return same(w.id, waybillId) && w.agent_id == null;
    });
    return row ? withItems(row) : null;
  };

  api.listOwnerWaybills = async function (customerId) {
    return ownerWaybills()
      .filter(function (w) { return same(w.customer_id, customerId); })
      .sort(function (a, b) { return Number(b.id) - Number(a.id); })
      .map(withItems);
  };

  api.listOwnerPayments = async function (customerId) {
    return state.ledger
      .filter(function (p) { return same(p.customer_id, customerId) && p.order_id == null; })
      .slice()
      .reverse()
      .map(function (p) {
        return Object.assign({}, p, {
          amount: n(p.amount),
          reversed: state.ledger.some(function (r) { return r.reverses_payment_id && same(r.reverses_payment_id, p.id); }),
        });
      });
  };

  api.legacyDebtPayments = async function (customerId) {
    return state.payments
      .filter(function (p) { return same(p.customer_id, customerId) && p.agent_id == null; })
      .map(function (p) {
        return {
          id: p.id,
          amount: n(p.amount),
          notes: p.notes,
          created_at: p.created_at,
          legacy_source: p.legacy_source || null,
          kind: 'legacy',
          method: 'cash',
        };
      });
  };

  api.listReminderWaybills = async function (tomorrow) {
    return ownerWaybills()
      .filter(function (w) {
        return n(w.debt_amount) > 0 && w.due_date && String(w.due_date) <= String(tomorrow);
      })
      .sort(function (a, b) {
        if (a.due_date !== b.due_date) return String(a.due_date) < String(b.due_date) ? -1 : 1;
        return Number(a.id) - Number(b.id);
      })
      .map(function (w) {
        const customer = state.customers.find(function (c) { return same(c.id, w.customer_id); });
        return {
          id: w.id,
          waybill_code: w.waybill_code,
          customer_id: w.customer_id,
          customer_name: customer ? customer.name : '',
          debt_amount: n(w.debt_amount),
          due_date: w.due_date,
          sale_date: w.sale_date || null,
          total_amount: n(w.total_amount),
          legacy_source: w.legacy_source || null,
          stock_posted: w.stock_posted === true,
        };
      });
  };

  api.getCompanySettings = async function () {
    const map = state.settings || {};
    return {
      name: map.company_name || '',
      phone: map.company_phone || map.customer_phone || '',
      card: map.company_card || '',
      card_holder: map.company_card_holder || '',
    };
  };

  api.storeCreditBalance = async function (customerId) {
    return creditOf(customerId);
  };

  api.ownerCustomerSummary = async function (customerId) {
    return { debt: debtOf(customerId), credit: creditOf(customerId) };
  };

  api.insertLegacyWaybill = async function (input) {
    const waybill = {
      id: next('waybill'),
      waybill_code: input.waybill_code || ('YX-LEG-' + next('waybill')),
      agent_id: null,
      customer_id: input.customer_id,
      total_amount: n(input.total_amount),
      paid_amount: n(input.paid_amount),
      debt_amount: n(input.debt_amount),
      commission_amount: 0,
      due_date: input.due_date || null,
      status: n(input.debt_amount) <= 0 ? 'paid' : (n(input.paid_amount) > 0 ? 'partial' : 'open'),
      note: input.note || null,
      idempotency_key: null,
      request_id: null,
      order_id: null,
      reys_id: null,
      stock_posted: input.stock_posted === true,
      sale_date: input.sale_date || null,
      legacy_source: input.legacy_source || 'briket-mini-app',
      created_at: input.created_at || new Date().toISOString(),
    };
    state.waybills.push(waybill);
    (input.items || []).forEach(function (it) {
      state.items.push({
        id: next('item'),
        waybill_id: waybill.id,
        product_id: it.product_id || null,
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price,
        subtotal: it.subtotal,
        commission: 0,
        legacy_source: input.legacy_source || 'briket-mini-app',
      });
    });
    return withItems(waybill);
  };
}

module.exports = { attachYukMemory: attachYukMemory };
