/**
 * Egasi yuk xati. Pul manbai — to'lov + taqsim.
 * paid_amount / debt_amount shu taqsimdan qayta hisoblanadi.
 * Mijoz yuborgan jami va to'langan olinmaydi.
 */
const money = require('./agent-money');
const { creatorFromActor, withCreatorName } = require('./yuk-creator');
const {
  som,
  httpError,
  strictSom,
  buildOwnerDraft,
  allocateBySaleDate,
  assertSaleDate,
  assertDueDate,
  dateOnly,
  waybillStatus,
  formatYukXati,
  addDaysYmd,
} = money;

function cleanText(value, max, label) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) throw httpError(400, label + ' juda uzun');
  return s;
}

function cleanRequestId(value, required) {
  if (value == null || value === '') {
    if (required) throw httpError(400, 'request_id kerak');
    return null;
  }
  const s = String(value).trim();
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(s)) {
    throw httpError(400, 'request_id 8..80 belgi (harf, raqam, . _ : -)');
  }
  return s;
}

function cleanCustomerId(value) {
  if (value == null || value === '' || !/^\d+$/.test(String(value))) {
    throw httpError(400, 'customer_id kerak');
  }
  return String(value);
}

function cleanReysChoice(value) {
  if (value == null || value === '') return 'auto';
  if (value === 'none' || value === 0 || value === '0') return null;
  if (!/^\d+$/.test(String(value))) throw httpError(400, 'reys_id noto\'g\'ri');
  return Number(value);
}

function methodOf(value) {
  const s = String(value || 'cash').trim().toLowerCase();
  if (s === 'card' || s === 'karta') return 'card';
  if (s === 'cash' || s === 'naqd') return 'cash';
  throw httpError(400, 'Usul naqd yoki karta bo\'lishi kerak');
}

function createYukService(store, helpers) {
  const today = function () {
    return helpers && helpers.tashkentDateStr ? helpers.tashkentDateStr() : money.tashkentToday();
  };

  async function companyOf(tx) {
    if (typeof tx.getCompanySettings === 'function') return tx.getCompanySettings();
    return { name: '', phone: '', card: '', card_holder: '' };
  }

  async function present(tx, waybill) {
    if (!waybill) return null;
    const full = await tx.getOwnerWaybill(waybill.id);
    if (!full) return null;
    const company = await companyOf(tx);
    if (waybill.credit_written) full.credit_written = waybill.credit_written;
    withCreatorName(full);
    full.text = formatYukXati(full, company);
    full.legacy = !!(full.legacy_source);
    full.stock_posted = full.stock_posted === true;
    return full;
  }

  async function recompute(tx, waybillId) {
    const wb = await tx.lockOwnerWaybill(waybillId);
    if (!wb) throw httpError(404, 'Yuk xati topilmadi');
    const alloc = await tx.allocationState(waybillId);
    const total = som(wb.total_amount);
    const paid = alloc.count > 0 ? som(alloc.sum) : som(wb.paid_amount);
    if (paid < 0) throw httpError(409, 'To\'lov manfiy bo\'lib qoldi');
    if (paid > total) throw httpError(409, 'To\'lov jami summadan oshib ketdi');
    const debt = total - paid;
    await tx.setWaybillMoney(waybillId, {
      total: total,
      paid: paid,
      debt: debt,
      status: waybillStatus(paid, debt),
      dueDate: wb.due_date || null,
      saleDate: dateOnly(wb.sale_date),
      note: wb.note || null,
    });
  }

  async function guardStock(tx, items, opts) {
    const options = opts || {};
    if (options.skip) return;
    const lines = items.map(function (it) { return { product_id: it.product_id, qty: it.quantity }; });
    const extra = options.extra || {};
    if (helpers && typeof helpers.assertStockForLines === 'function' && typeof tx.query === 'function') {
      try {
        await helpers.assertStockForLines(
          { query: function (sql, params) { return tx.query(sql, params); } },
          lines,
          extra
        );
      } catch (err) {
        if (!err.status) err.status = 400;
        throw err;
      }
      return;
    }
    if (typeof tx.assertStock === 'function') await tx.assertStock(lines, extra);
  }

  async function assertReysFits(tx, reysId, items, ignoreWaybillId) {
    const reys = await tx.lockReys(reysId);
    if (!reys) throw httpError(404, 'Reys topilmadi');
    if (reys.status !== 'open') throw httpError(400, 'Reys yopilgan');
    const loadItems = await tx.listReysItems(reysId);
    const tripBills = await tx.listWaybillsByReys(reysId);
    const sold = {};
    (tripBills || []).forEach(function (w) {
      if (ignoreWaybillId && String(w.id) === String(ignoreWaybillId)) return;
      (w.items || []).forEach(function (it) {
        const k = String(it.product_id);
        sold[k] = (sold[k] || 0) + Number(it.quantity || 0);
      });
    });
    const load = {};
    (loadItems || []).forEach(function (it) {
      load[String(it.product_id)] = Number(it.loaded_qty || 0);
    });
    const need = {};
    items.forEach(function (it) {
      const k = String(it.product_id);
      need[k] = (need[k] || 0) + Number(it.quantity || 0);
    });
    Object.keys(need).forEach(function (k) {
      if (load[k] == null) throw httpError(400, 'Bu mahsulot reysda yo\'q');
      const left = load[k] - (sold[k] || 0);
      if (need[k] > left + 0.0001) {
        throw httpError(400, 'Reys yuki yetarli emas (qolgan: ' + left + ', kerak: ' + need[k] + ')');
      }
    });
    return reys;
  }

  function productsById(rows) {
    return new Map(rows.map(function (p) { return [String(p.id), p]; }));
  }

  async function draftFrom(tx, body) {
    const rawItems = body && Array.isArray(body.items) ? body.items : [];
    const ids = rawItems.map(function (it) { return it && it.product_id; }).filter(function (id) {
      return id != null && id !== '';
    });
    const rows = await tx.getActiveProductsByIds(ids);
    return buildOwnerDraft(body || {}, productsById(rows));
  }

  async function ensureBackfill(tx, customerId, waybillId) {
    const wb = await tx.lockOwnerWaybill(waybillId);
    if (!wb) return;
    const alloc = await tx.allocationState(waybillId);
    const paid = som(wb.paid_amount);
    if (alloc.count === 0 && paid > 0) {
      await tx.insertLedgerPayment({
        customerId: customerId,
        amount: paid,
        method: 'cash',
        kind: 'backfill',
        note: 'Tarixiy to\'lov ' + (wb.waybill_code || ''),
        allocations: [{ waybill_id: waybillId, amount: paid }],
        credit: 0,
      });
    }
  }

  async function applyParts(tx, spec) {
    const open = await tx.listOpenOwnerWaybills(spec.customerId);
    for (let b = 0; b < open.length; b++) {
      await ensureBackfill(tx, spec.customerId, open[b].id);
    }
    if (spec.preferId != null) await ensureBackfill(tx, spec.customerId, spec.preferId);
    const debt = {};
    open.forEach(function (w) { debt[String(w.id)] = som(w.debt_amount); });
    const touched = {};
    for (let i = 0; i < spec.parts.length; i++) {
      const part = spec.parts[i];
      let left = part.amount;
      const allocations = [];
      if (spec.preferId != null && left > 0) {
        const key = String(spec.preferId);
        const have = debt[key] || 0;
        const take = Math.min(have, left);
        if (take > 0) {
          allocations.push({ waybill_id: spec.preferId, amount: take });
          debt[key] = have - take;
          left -= take;
          touched[key] = true;
        }
      }
      if (left > 0) {
        const others = open
          .filter(function (w) { return String(w.id) !== String(spec.preferId); })
          .map(function (w) {
            return Object.assign({}, w, { debt_amount: debt[String(w.id)] || 0 });
          });
        const plan = allocateBySaleDate(others, left);
        if (plan.error) throw httpError(400, plan.error);
        plan.allocations.forEach(function (a) {
          allocations.push({ waybill_id: a.waybill_id, amount: a.amount });
          const key = String(a.waybill_id);
          debt[key] = (debt[key] || 0) - a.amount;
          touched[key] = true;
        });
        part.credit = plan.credit;
      } else {
        part.credit = 0;
      }
      await tx.insertLedgerPayment({
        customerId: spec.customerId,
        amount: part.amount,
        method: part.method,
        kind: part.kind || 'collection',
        note: part.note,
        requestId: part.requestId,
        allocations: allocations,
        credit: part.credit,
        waybillId: spec.preferId || null,
        creditNote: part.credit ? 'Ortiqcha to\'lov do\'kon kreditiga yozildi' : null,
        creator: spec.creator || null,
      });
    }
    const ids = Object.keys(touched);
    for (let i = 0; i < ids.length; i++) await recompute(tx, ids[i]);
    return spec.parts.reduce(function (s, p) { return s + som(p.credit); }, 0);
  }

  return {
    async bootstrap() {
      const day = today();
      const products = await store.listActiveProducts();
      const company = await store.getCompanySettings();
      let open = null;
      if (typeof store.findOpenReys === 'function') {
        const reys = await store.findOpenReys();
        if (reys) {
          const items = await store.listReysItems(reys.id);
          open = { id: reys.id, reys_code: reys.reys_code, status: reys.status, items: items };
        }
      }
      return {
        today: day,
        min_date: addDaysYmd(day, -90),
        products: products.map(function (p) {
          return {
            id: p.id,
            sku: p.sku,
            price: som(p.price),
            weight_kg: p.weight_kg,
          };
        }),
        company: company,
        open_reys: open,
        role: 'owner',
      };
    },

    async me(actor) {
      if (actor && actor.kind === 'erp-admin') {
        const creator = creatorFromActor(actor);
        return {
          role: 'erp-admin',
          telegram_id: null,
          username: null,
          full_name: creator ? creator.firstName : 'Admin',
        };
      }
      const tgUser = actor || {};
      return {
        role: 'owner',
        telegram_id: String(tgUser.id),
        username: tgUser.username || null,
        full_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim(),
      };
    },

    listCustomers(query) {
      return store.listOwnerCustomers(query || '');
    },

    async createCustomer(body) {
      const name = cleanText(body && body.name, 200, 'Ism');
      if (!name) throw httpError(400, 'Ism kerak');
      const phone = cleanText(body && body.phone, 32, 'Telefon');
      const address = cleanText(body && body.address, 500, 'Manzil');
      let latitude = null;
      let longitude = null;
      if (body && body.latitude != null && body.latitude !== '') {
        latitude = Number(body.latitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
          throw httpError(400, 'Kenglik -90..90');
        }
      }
      if (body && body.longitude != null && body.longitude !== '') {
        longitude = Number(body.longitude);
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          throw httpError(400, 'Uzunlik -180..180');
        }
      }
      return store.insertOwnerCustomer({
        name: name,
        phone: phone,
        address: address,
        latitude: latitude,
        longitude: longitude,
      });
    },

    async customerDetail(customerId) {
      const id = cleanCustomerId(customerId);
      const customer = await store.lockOwnerCustomer(id);
      if (!customer) throw httpError(404, 'Do\'kon topilmadi');
      const summary = await store.ownerCustomerSummary(id);
      const waybills = await store.listOwnerWaybills(id);
      const payments = await store.listOwnerPayments(id);
      const legacy = await store.legacyDebtPayments(id);
      return {
        customer: customer,
        debt_amount: summary.debt,
        store_credit: summary.credit,
        outstanding: Math.max(0, summary.debt - summary.credit),
        waybills: waybills.map(withCreatorName),
        payments: payments.map(withCreatorName),
        legacy_payments: legacy,
      };
    },

    async createSale(body, actor) {
      const creator = creatorFromActor(actor);
      const requestId = cleanRequestId(body && body.request_id, true);
      const customerId = cleanCustomerId(body && body.customer_id);
      const saleDate = assertSaleDate(body && body.sale_date, today());
      const naqd = body && body.naqd != null && body.naqd !== '' ? strictSom(body.naqd, 'Naqd') : 0;
      const karta = body && body.karta != null && body.karta !== '' ? strictSom(body.karta, 'Karta') : 0;
      if (naqd < 0 || karta < 0) throw httpError(400, 'To\'lov manfiy bo\'lmasin');
      const note = cleanText(body && body.note, 2000, 'Izoh');
      const choice = cleanReysChoice(body && body.reys_id);
      if (body && body.paid_amount != null && body.paid_amount !== '') {
        strictSom(body.paid_amount, 'To\'langan');
      }
      try {
        const saved = await store.transaction(async function (tx) {
          const customer = await tx.lockOwnerCustomer(customerId);
          if (!customer) throw httpError(404, 'Do\'kon topilmadi');
          if (customer.is_active === false) throw httpError(400, 'Do\'kon nofaol');
          const again = await tx.findOwnerWaybillByRequestId(requestId);
          if (again) {
            const replayed = await present(tx, again);
            return Object.assign({}, replayed, { replay: true });
          }
          const draft = await draftFrom(tx, body);
          const paid = naqd + karta;
          const onThis = Math.min(paid, draft.total_amount);
          const debt = draft.total_amount - onThis;
          const due = assertDueDate(body && body.due_date, saleDate, debt);
          if (debt > 0 && helpers && typeof helpers.checkCreditLimit === 'function' && typeof tx.query === 'function') {
            const cred = await helpers.checkCreditLimit(
              { query: function (sql, params) { return tx.query(sql, params); } },
              customer.id,
              debt
            );
            if (!cred.ok) throw httpError(400, cred.error || 'Nasiya limiti yetarli emas');
          }
          let reysId = null;
          let stockPosted = true;
          if (choice === 'auto') {
            const open = typeof tx.findOpenReys === 'function' ? await tx.findOpenReys() : null;
            reysId = open ? open.id : null;
          } else {
            reysId = choice;
          }
          if (reysId) {
            await assertReysFits(tx, reysId, draft.items);
            await guardStock(tx, draft.items, { skip: true });
            stockPosted = false;
          } else {
            await guardStock(tx, draft.items);
          }
          const code = await tx.nextWaybillCode(saleDate);
          const waybill = await tx.insertOwnerWaybill({
            code: code,
            customerId: customer.id,
            draft: draft,
            requestId: requestId,
            saleDate: saleDate,
            dueDate: due,
            note: note,
            reysId: reysId,
            stockPosted: stockPosted,
            creator: creator,
          });
          let creditWritten = 0;
          if (paid > 0) {
            const parts = [];
            if (naqd > 0) {
              parts.push({
                amount: naqd,
                method: 'cash',
                requestId: requestId + ':naqd',
                note: 'Yuk xati ' + code + ' naqd',
              });
            }
            if (karta > 0) {
              parts.push({
                amount: karta,
                method: 'card',
                requestId: requestId + ':karta',
                note: 'Yuk xati ' + code + ' karta',
              });
            }
            creditWritten = await applyParts(tx, {
              customerId: customer.id,
              preferId: waybill.id,
              parts: parts,
              creator: creator,
            });
          }
          const full = await present(tx, { id: waybill.id, credit_written: creditWritten });
          full.customer_name = customer.name;
          full.credit_written = creditWritten;
          full.text = formatYukXati(full, await companyOf(tx));
          return full;
        });
        if (saved && saved.replay) return saved;
        return saved;
      } catch (err) {
        if (err && err.code === '23505') {
          const existing = await store.findOwnerWaybillByRequestId(requestId);
          if (existing) {
            const full = await present(store, existing);
            return Object.assign({}, full, { replay: true });
          }
        }
        throw err;
      }
    },

    async editSale(waybillId, body) {
      if (!/^\d+$/.test(String(waybillId || ''))) throw httpError(400, 'id noto\'g\'ri');
      if (body && (body.paid_amount != null || body.naqd != null || body.karta != null)) {
        throw httpError(400, 'To\'langan summa tahrirlanmaydi');
      }
      return store.transaction(async function (tx) {
        const locked = await tx.lockOwnerWaybill(waybillId);
        if (!locked) throw httpError(404, 'Yuk xati topilmadi');
        const customer = await tx.lockOwnerCustomer(locked.customer_id);
        if (!customer) throw httpError(404, 'Do\'kon topilmadi');
        const draft = await draftFrom(tx, body);
        const saleDate = body && body.sale_date
          ? assertSaleDate(body.sale_date, today())
          : (dateOnly(locked.sale_date) || today());
        const alloc = await tx.allocationState(locked.id);
        let allocated = alloc.count > 0 ? som(alloc.sum) : som(locked.paid_amount);
        if (alloc.count === 0 && som(locked.paid_amount) > 0) {
          await tx.insertLedgerPayment({
            customerId: customer.id,
            amount: som(locked.paid_amount),
            method: 'cash',
            kind: 'backfill',
            note: 'Tarixiy to\'lov ' + (locked.waybill_code || ''),
            allocations: [{ waybill_id: locked.id, amount: som(locked.paid_amount) }],
            credit: 0,
          });
          allocated = som(locked.paid_amount);
        }
        const oldItems = (await tx.getOwnerWaybill(locked.id)).items || [];
        if (draft.total_amount < allocated) {
          const surplus = allocated - draft.total_amount;
          const open = await tx.listOpenOwnerWaybills(customer.id);
          const others = open.filter(function (w) { return String(w.id) !== String(locked.id); });
          for (let b = 0; b < others.length; b++) await ensureBackfill(tx, customer.id, others[b].id);
          const plan = allocateBySaleDate(others, surplus);
          if (plan.error) throw httpError(400, plan.error);
          const allocations = [{ waybill_id: locked.id, amount: -surplus }].concat(
            plan.allocations.map(function (a) { return { waybill_id: a.waybill_id, amount: a.amount }; })
          );
          await tx.insertLedgerPayment({
            customerId: customer.id,
            amount: 0,
            method: 'cash',
            kind: 'reallocation',
            note: 'Tahrir qoldig\'i ' + (locked.waybill_code || ''),
            allocations: allocations,
            credit: plan.credit,
            waybillId: locked.id,
            creditNote: 'Tahrirdan keyin do\'kon krediti',
          });
        }
        const debt = Math.max(0, draft.total_amount - Math.min(allocated, draft.total_amount));
        const due = assertDueDate(
          body && Object.prototype.hasOwnProperty.call(body, 'due_date') ? body.due_date : locked.due_date,
          saleDate,
          debt
        );
        const note = Object.prototype.hasOwnProperty.call(body || {}, 'note')
          ? cleanText(body.note, 2000, 'Izoh')
          : (locked.note || null);
        if (locked.reys_id) {
          await assertReysFits(tx, locked.reys_id, draft.items, locked.id);
        } else if (locked.stock_posted === true) {
          const extra = {};
          oldItems.forEach(function (it) {
            const k = String(it.product_id);
            extra[k] = (extra[k] || 0) + Number(it.quantity || 0);
          });
          await guardStock(tx, draft.items, { extra: extra });
        }
        await tx.replaceOwnerItems(locked.id, draft.items);
        await tx.setWaybillMoney(locked.id, {
          total: draft.total_amount,
          paid: som(locked.paid_amount),
          debt: som(locked.debt_amount),
          status: locked.status,
          dueDate: due,
          saleDate: saleDate,
          note: note,
        });
        const touched = {};
        touched[String(locked.id)] = true;
        const allocRows = await tx.allocationState(locked.id);
        if (draft.total_amount < allocated || allocRows.count > 0) {
          const openAfter = await tx.listOpenOwnerWaybills(customer.id);
          openAfter.forEach(function (w) { touched[String(w.id)] = true; });
          const creditsMoved = await tx.getOwnerWaybill(locked.id);
          void creditsMoved;
        }
        const ids = Object.keys(touched);
        for (let i = 0; i < ids.length; i++) await recompute(tx, ids[i]);
        const full = await present(tx, { id: locked.id });
        const summary = await tx.ownerCustomerSummary(customer.id);
        full.store_credit = summary.credit;
        full.paid_locked = true;
        if (draft.total_amount < allocated) {
          full.realloc_note = summary.credit > 0
            ? 'Ortiqcha to\'lov do\'kon kreditida'
            : 'Ortiqcha to\'lov eski yuk xatlariga yozildi';
        }
        return full;
      });
    },

    async collectPayment(customerId, body, actor) {
      const creator = creatorFromActor(actor);
      const id = cleanCustomerId(customerId);
      const requestId = cleanRequestId(body && body.request_id, true);
      const amount = strictSom(body && body.amount, 'Summa');
      if (!(amount > 0)) throw httpError(400, 'Summa musbat bo\'lishi kerak');
      const method = methodOf(body && body.method);
      const note = cleanText(body && body.note, 2000, 'Izoh');
      try {
        return await store.transaction(async function (tx) {
          const customer = await tx.lockOwnerCustomer(id);
          if (!customer) throw httpError(404, 'Do\'kon topilmadi');
          const existing = await tx.findLedgerPaymentByRequestId(requestId);
          if (existing) return Object.assign({}, existing, { replay: true });
          await applyParts(tx, {
            customerId: customer.id,
            preferId: null,
            parts: [{
              amount: amount,
              method: method,
              requestId: requestId,
              note: note || 'Qarz to\'lovi',
            }],
            creator: creator,
          });
          const payment = withCreatorName(await tx.findLedgerPaymentByRequestId(requestId));
          const summary = await tx.ownerCustomerSummary(customer.id);
          return {
            payment: payment,
            debt_amount: summary.debt,
            store_credit: summary.credit,
            outstanding: Math.max(0, summary.debt - summary.credit),
          };
        });
      } catch (err) {
        if (err && err.code === '23505') {
          const existing = await store.findLedgerPaymentByRequestId(requestId);
          if (existing) return Object.assign({}, existing, { replay: true });
        }
        throw err;
      }
    },

    async reversePayment(paymentId, body, actor) {
      const creator = creatorFromActor(actor);
      if (!/^\d+$/.test(String(paymentId || ''))) throw httpError(400, 'id noto\'g\'ri');
      const requestId = cleanRequestId(body && body.request_id, true);
      const note = cleanText(body && body.note, 2000, 'Izoh');
      try {
        return await store.transaction(async function (tx) {
          const payment = await tx.getLedgerPayment(paymentId);
          if (!payment) throw httpError(404, 'To\'lov topilmadi');
          if (payment.kind === 'reversal') throw httpError(400, 'Tuzatishning o\'zi bekor qilinmaydi');
          if (payment.kind === 'reallocation') throw httpError(400, 'Tahrir taqsimi shu yerda bekor qilinmaydi');
          if (payment.reversed) throw httpError(409, 'To\'lov allaqachon tuzatilgan');
          const customer = await tx.lockOwnerCustomer(payment.customer_id);
          if (!customer) throw httpError(404, 'Do\'kon topilmadi');
          const existing = await tx.findLedgerPaymentByRequestId(requestId);
          if (existing) return Object.assign({}, existing, { replay: true });
          const allocations = (payment.allocations || []).map(function (a) {
            return { waybill_id: a.waybill_id, amount: -som(a.amount) };
          });
          await tx.insertLedgerPayment({
            customerId: payment.customer_id,
            amount: -som(payment.amount),
            method: payment.method || 'cash',
            kind: 'reversal',
            note: note || ('Tuzatish #' + payment.id),
            requestId: requestId,
            reversesPaymentId: payment.id,
            allocations: allocations,
            credit: payment.credit ? -som(payment.credit) : 0,
            creditNote: 'To\'lov tuzatishi',
            creator: creator,
          });
          const ids = {};
          allocations.forEach(function (a) { ids[String(a.waybill_id)] = true; });
          const keys = Object.keys(ids);
          for (let i = 0; i < keys.length; i++) await recompute(tx, keys[i]);
          const reversal = await tx.findLedgerPaymentByRequestId(requestId);
          return { reversal: reversal, original_id: payment.id, deleted: false };
        });
      } catch (err) {
        if (err && err.code === '23505') {
          const existing = await store.findLedgerPaymentByRequestId(requestId);
          if (existing) return Object.assign({}, existing, { replay: true });
          throw httpError(409, 'To\'lov allaqachon tuzatilgan');
        }
        throw err;
      }
    },

    async reminders() {
      const day = today();
      const tomorrow = addDaysYmd(day, 1);
      const rows = await store.listReminderWaybills(tomorrow);
      const groups = { overdue: [], today: [], tomorrow: [] };
      rows.forEach(function (row) {
        const due = dateOnly(row.due_date) || String(row.due_date).slice(0, 10);
        if (due < day) groups.overdue.push(row);
        else if (due === day) groups.today.push(row);
        else if (due === tomorrow) groups.tomorrow.push(row);
      });
      return { today: day, tomorrow: tomorrow, groups: groups };
    },

    async waybillText(waybillId) {
      if (!/^\d+$/.test(String(waybillId || ''))) throw httpError(400, 'id noto\'g\'ri');
      const row = await store.getOwnerWaybill(waybillId);
      if (!row) throw httpError(404, 'Yuk xati topilmadi');
      return present(store, row);
    },

    async sendToOwner(waybillId, telegramId, deps) {
      const doc = await this.waybillText(waybillId);
      const token = String((process.env.TELEGRAM_BOT_TOKEN || '')).trim();
      if (!token) throw httpError(503, 'TELEGRAM_BOT_TOKEN o\'rnatilmagan');
      const chatId = telegramId != null ? String(telegramId).trim() : '';
      if (!chatId) throw httpError(400, 'Telegram chat yo\'q');
      const fetchImpl = (deps && deps.fetchImpl) || global.fetch;
      if (typeof fetchImpl !== 'function') throw httpError(500, 'fetch yo\'q');
      const res = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: doc.text,
          disable_web_page_preview: true,
        }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data || data.ok !== true) {
        const desc = data && data.description ? data.description : 'Telegram javob bermadi';
        throw httpError(502, 'Yuk xati yuborilmadi: ' + desc);
      }
      return { ok: true, message_id: data.result && data.result.message_id, waybill_code: doc.waybill_code };
    },
  };
}

module.exports = { createYukService: createYukService };
