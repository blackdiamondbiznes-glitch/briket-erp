const money = require('./agent-money');
const { som, httpError, commissionAllowed, commissionOnCollection, buildWaybillDraft, allocateDebtPayment, dateOnly } = money;

function cleanText(value, max, label) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) throw httpError(400, label + ' juda uzun');
  return s;
}

function cleanCustomerFields(body, partial) {
  const src = body || {};
  const out = {};
  if (!partial || Object.prototype.hasOwnProperty.call(src, 'name')) {
    const name = cleanText(src.name, 200, 'Ism');
    if (!name) throw httpError(400, 'Ism kerak');
    out.name = name;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(src, 'phone')) {
    out.phone = cleanText(src.phone, 32, 'Telefon');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(src, 'address')) {
    out.address = cleanText(src.address, 500, 'Manzil');
  }
  if (!partial || Object.prototype.hasOwnProperty.call(src, 'note')) {
    out.note = cleanText(src.note, 500, 'Izoh');
  }
  [
    ['latitude', 'lat', -90, 90, 'Kenglik -90..90'],
    ['longitude', 'lng', -180, 180, 'Uzunlik -180..180'],
  ].forEach(function (spec) {
    const key = spec[0];
    const alias = spec[1];
    const present =
      Object.prototype.hasOwnProperty.call(src, key) || Object.prototype.hasOwnProperty.call(src, alias);
    if (!present) return;
    const raw = src[key] != null && src[key] !== '' ? src[key] : src[alias];
    if (raw == null || raw === '') {
      out[key] = null;
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw httpError(400, key + ' son bo\'lishi kerak');
    if (n < spec[2] || n > spec[3]) throw httpError(400, spec[4]);
    out[key] = n;
  });
  return out;
}

function telegramName(user) {
  const full = [user && user.first_name, user && user.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user && user.username) return '@' + user.username;
  return 'Agent';
}

function publicAgent(agent) {
  if (!agent) return null;
  return {
    id: agent.id,
    telegram_id: agent.telegram_id == null ? null : String(agent.telegram_id),
    telegram_username: agent.telegram_username || null,
    full_name: agent.full_name || '',
    email: agent.email || null,
    role: agent.role || 'agent',
    access_status: agent.access_status || 'pending',
    commission_enabled_on: dateOnly(agent.commission_enabled_on),
    is_active: agent.is_active !== false,
  };
}

function zeroCommission(draft) {
  draft.items.forEach(function (it) { it.commission = 0; });
  draft.commission_amount = 0;
  return draft;
}

function cleanIdempotencyKey(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(s)) {
    throw httpError(400, 'idempotency_key 8..80 belgi (harf, raqam, . _ : -)');
  }
  return s;
}

function balanceOf(totals) {
  const earned = som(totals && totals.earned);
  const withdrawn = som(totals && totals.withdrawn);
  return { earned: earned, withdrawn: withdrawn, balance: earned - withdrawn };
}

function createAgentService(store, helpers) {
  const today = function () {
    return helpers && helpers.tashkentDateStr ? helpers.tashkentDateStr() : dateOnly(new Date());
  };
  const newCode = function () {
    if (helpers && helpers.uniqueTmpCode) return helpers.uniqueTmpCode('YX');
    return 'YX-' + Date.now().toString(36);
  };

  async function guardSale(tx, customerId, debt, items) {
    if (debt > 0 && helpers && typeof helpers.checkCreditLimit === 'function' && typeof tx.query === 'function') {
      const cred = await helpers.checkCreditLimit(
        { query: function (sql, params) { return tx.query(sql, params); } },
        customerId,
        debt
      );
      if (!cred.ok) throw httpError(400, cred.error || 'Nasiya limiti yetarli emas');
    } else if (debt > 0 && typeof tx.checkCredit === 'function') {
      const cred = await tx.checkCredit(customerId, debt);
      if (cred && cred.ok === false) throw httpError(400, cred.error || 'Nasiya limiti yetarli emas');
    }
    const lines = items.map(function (it) { return { product_id: it.product_id, qty: it.quantity }; });
    if (helpers && typeof helpers.assertStockForLines === 'function' && typeof tx.query === 'function') {
      try {
        await helpers.assertStockForLines(
          { query: function (sql, params) { return tx.query(sql, params); } },
          lines
        );
      } catch (err) {
        if (!err.status) err.status = 400;
        throw err;
      }
    } else if (typeof tx.assertStock === 'function') {
      await tx.assertStock(lines);
    }
  }

  async function requireOwnedCustomer(tx, agentId, customerId) {
    const customer = await tx.getCustomer(agentId, customerId, { lock: true });
    if (!customer) throw httpError(404, 'Mijoz topilmadi');
    return customer;
  }

  return {
    async getMe(tgUser) {
      const telegramId = String(tgUser.id);
      const agent = await store.getAgentByTelegram(telegramId);
      const accessRequest = await store.getLatestAccessRequest(telegramId);
      let commission = null;
      if (agent && agent.access_status === 'approved' && agent.is_active !== false) {
        commission = balanceOf(await store.commissionTotals(agent.id));
      }
      return {
        telegram: {
          id: telegramId,
          username: tgUser.username || null,
          full_name: telegramName(tgUser),
        },
        agent: publicAgent(agent),
        access_request: accessRequest
          ? { id: accessRequest.id, status: accessRequest.status, created_at: accessRequest.created_at }
          : null,
        commission: commission,
      };
    },

    async requestAccess(tgUser, body) {
      const telegramId = String(tgUser.id);
      const agent = await store.getAgentByTelegram(telegramId);
      if (agent && agent.access_status === 'approved' && agent.is_active !== false && agent.role === 'agent') {
        return { already_approved: true, agent: publicAgent(agent) };
      }
      const fullName = cleanText(body && body.full_name, 200, 'Ism') || telegramName(tgUser);
      let notifyId = null;
      if (body && body.notify_message_id != null && body.notify_message_id !== '') {
        const n = Number(body.notify_message_id);
        if (!Number.isFinite(n)) throw httpError(400, 'notify_message_id son bo\'lishi kerak');
        notifyId = Math.trunc(n);
      }
      const row = await store.insertAccessRequest({
        telegram_id: telegramId,
        telegram_username: tgUser.username || null,
        full_name: fullName,
        notify_message_id: notifyId,
      });
      return { request: row, already_pending: row.already_pending === true };
    },

    listCustomers(agentId) {
      return store.listCustomers(agentId);
    },

    async getCustomer(agentId, customerId) {
      const row = await store.getCustomer(agentId, customerId);
      if (!row) throw httpError(404, 'Mijoz topilmadi');
      return row;
    },

    async createCustomer(agentId, body) {
      const fields = cleanCustomerFields(body, false);
      if (!fields.note) fields.note = 'Agent do\'koni';
      return store.insertCustomer(agentId, fields);
    },

    async updateCustomer(agentId, customerId, body) {
      const fields = cleanCustomerFields(body, true);
      if (!Object.keys(fields).length) throw httpError(400, 'O\'zgarish yo\'q');
      const row = await store.updateCustomer(agentId, customerId, fields);
      if (!row) throw httpError(404, 'Mijoz topilmadi');
      return row;
    },

    async deactivateCustomer(agentId, customerId) {
      const row = await store.deactivateCustomer(agentId, customerId);
      if (!row) throw httpError(404, 'Mijoz topilmadi');
      return row;
    },

    listProducts() {
      return store.listActiveProducts();
    },

    async createWaybill(agent, body) {
      const rawItems = body && Array.isArray(body.items) ? body.items : [];
      const ids = rawItems.map((it) => it && it.product_id).filter((id) => id != null && id !== '');
      return store.transaction(async function (tx) {
        const customer = await requireOwnedCustomer(tx, agent.id, body && body.customer_id);
        if (customer.is_active === false) throw httpError(400, 'Mijoz nofaol');
        const products = await tx.getActiveProductsByIds(ids);
        const byId = new Map(products.map((p) => [String(p.id), p]));
        const draft = buildWaybillDraft(body || {}, byId);
        const allowed = commissionAllowed(agent, today());
        const commissionNow = commissionOnCollection({
          potential: draft.commission_amount,
          alreadyEarned: 0,
          collected: draft.paid_amount,
          originalTotal: draft.total_amount,
          allowed: allowed,
          clearsRemainder: draft.debt_amount === 0,
        });
        return tx.saveWaybill({
          agentId: agent.id,
          customerId: customer.id,
          code: newCode(),
          draft: draft,
          commissionNow: commissionNow,
        });
      });
    },

    async createAdminWaybill(body) {
      const key = cleanIdempotencyKey(body && (body.idempotency_key || body.client_key));
      if (key) {
        const existing = await store.findWaybillByIdempotency(key);
        if (existing) return Object.assign({}, existing, { replay: true });
      }
      try {
        return await store.transaction(async function (tx) {
          if (key) {
            const again = await tx.findWaybillByIdempotency(key);
            if (again) return Object.assign({}, again, { replay: true });
          }
          const customerId = body && body.customer_id;
          if (customerId == null || customerId === '' || !/^\d+$/.test(String(customerId))) {
            throw httpError(400, 'customer_id kerak');
          }
          const customer = await tx.getCustomerById(customerId);
          if (!customer) throw httpError(404, 'Mijoz topilmadi');
          if (customer.is_active === false) throw httpError(400, 'Mijoz nofaol');
          const rawItems = body && Array.isArray(body.items) ? body.items : [];
          const ids = rawItems.map(function (it) { return it && it.product_id; }).filter(function (id) {
            return id != null && id !== '';
          });
          const products = await tx.getActiveProductsByIds(ids);
          const byId = new Map(products.map(function (p) { return [String(p.id), p]; }));
          const draft = zeroCommission(buildWaybillDraft(body || {}, byId));
          await guardSale(tx, customer.id, draft.debt_amount, draft.items);
          const waybill = await tx.saveWaybill({
            agentId: null,
            customerId: customer.id,
            code: newCode(),
            draft: draft,
            commissionNow: 0,
            idempotencyKey: key,
            stockPosted: true,
          });
          if (draft.paid_amount > 0) {
            await tx.insertFieldPayment({
              customerId: customer.id,
              amount: draft.paid_amount,
              method: 'cash',
              note: 'Yuk xati ' + waybill.waybill_code,
            });
          }
          waybill.customer_name = customer.name;
          waybill.customer_phone = customer.phone || null;
          waybill.order_id = null;
          return waybill;
        });
      } catch (err) {
        if (err && err.code === '23505' && key) {
          const existing = await store.findWaybillByIdempotency(key);
          if (existing) return Object.assign({}, existing, { replay: true });
        }
        throw err;
      }
    },

    async getAdminWaybill(waybillId) {
      const row = await store.getAdminWaybill(waybillId);
      if (!row) throw httpError(404, 'Yuk xati topilmadi');
      return row;
    },

    async recordAdminPayment(waybillId, body) {
      const amount = som(body && body.amount);
      const note = cleanText(body && (body.note != null ? body.note : body.notes), 2000, 'Izoh');
      const method = cleanText(body && body.method, 40, 'Usul') || 'cash';
      return store.transaction(async function (tx) {
        const locked = await tx.lockWaybill(waybillId);
        if (!locked) throw httpError(404, 'Yuk xati topilmadi');
        if (!(amount > 0)) throw httpError(400, 'Summa musbat bo\'lishi kerak');
        if (amount > som(locked.debt_amount)) throw httpError(400, 'Summa qarzdan oshib ketdi');
        const updated = await tx.applyAdminPayment({
          waybillId: locked.id,
          customerId: locked.customer_id,
          amount: amount,
          method: method,
          note: note || ('Yuk xati ' + (locked.waybill_code || '')),
        });
        if (!updated) throw httpError(400, 'Qarz yangilanmadi');
        return tx.getAdminWaybill(locked.id);
      });
    },

    listWaybills(agentId) {
      return store.listWaybills(agentId);
    },

    async getWaybill(agentId, waybillId) {
      const row = await store.getWaybill(agentId, waybillId);
      if (!row) throw httpError(404, 'Yuk xati topilmadi');
      return row;
    },

    listDebtPayments(agentId) {
      return store.listDebtPayments(agentId);
    },

    async collectDebt(agent, body) {
      const amount = som(body && body.amount);
      const notes = cleanText(body && (body.notes != null ? body.notes : body.note), 2000, 'Izoh');
      const allowed = commissionAllowed(agent, today());
      return store.transaction(async function (tx) {
        const customer = await requireOwnedCustomer(tx, agent.id, body && body.customer_id);
        const open = await tx.listOpenWaybillsWithEarned(agent.id, customer.id);
        const plan = allocateDebtPayment(open, amount, { allowed: allowed });
        if (plan.error) throw httpError(400, plan.error);
        return tx.saveDebtCollection({
          agentId: agent.id,
          customerId: customer.id,
          amount: amount,
          notes: notes,
          allocations: plan.allocations,
        });
      });
    },

    async commission(agentId) {
      const totals = await store.commissionTotals(agentId);
      const events = await store.listCommissionEvents(agentId);
      const withdrawals = await store.listWithdrawals(agentId);
      return Object.assign(balanceOf(totals), { events: events, withdrawals: withdrawals });
    },

    async withdraw(agentId, body) {
      const amount = som(body && body.amount);
      if (!(amount > 0)) throw httpError(400, 'Summa musbat bo\'lishi kerak');
      const notes = cleanText(body && (body.notes != null ? body.notes : body.note), 2000, 'Izoh');
      return store.transaction(async function (tx) {
        const agent = await tx.lockAgent(agentId);
        if (!agent) throw httpError(404, 'Agent topilmadi');
        const totals = await tx.commissionTotals(agentId);
        const bal = balanceOf(totals);
        if (amount > bal.balance) throw httpError(400, 'Komissiya balansi yetarli emas');
        const row = await tx.insertWithdrawal({ agentId: agentId, amount: amount, notes: notes });
        return Object.assign({ withdrawal: row }, { balance: bal.balance - amount, earned: bal.earned, withdrawn: bal.withdrawn + amount });
      });
    },

    adminListAgents() {
      return store.adminListAgents();
    },

    adminListRequests(status) {
      return store.adminListRequests(status);
    },

    adminWaybills(agentId, scope) {
      return store.adminListWaybills(agentId, scope);
    },

    adminDebts(agentId) {
      return store.adminDebts(agentId);
    },

    async adminCommissions(agentId) {
      if (agentId) {
        const totals = await store.commissionTotals(agentId);
        return Object.assign(balanceOf(totals), {
          agent_id: Number(agentId),
          events: await store.listCommissionEvents(agentId),
          withdrawals: await store.listWithdrawals(agentId),
        });
      }
      const agents = await store.adminListAgents();
      return agents.map(function (a) {
        return {
          agent_id: a.id,
          full_name: a.full_name,
          earned: som(a.commission_earned),
          withdrawn: som(a.commission_withdrawn),
          balance: som(a.commission_earned) - som(a.commission_withdrawn),
        };
      });
    },

    adminApprove(requestId, operator, commissionEnabledOn) {
      let enabled = null;
      if (commissionEnabledOn != null && commissionEnabledOn !== '') {
        enabled = dateOnly(commissionEnabledOn);
        if (!enabled) throw httpError(400, 'commission_enabled_on YYYY-MM-DD bo\'lishi kerak');
      }
      const who = cleanText(operator, 200, 'Operator') || 'admin';
      return store.transaction(async function (tx) {
        const reqRow = await tx.lockAccessRequest(requestId);
        if (!reqRow) throw httpError(404, 'So\'rov topilmadi');
        if (reqRow.status !== 'pending') throw httpError(409, 'So\'rov allaqachon ko\'rib chiqilgan');
        let agent = await tx.lockAgentByTelegram(reqRow.telegram_id);
        if (!agent) {
          agent = await tx.insertAgent({
            telegram_id: reqRow.telegram_id,
            telegram_username: reqRow.telegram_username,
            full_name: reqRow.full_name || '',
            role: 'agent',
            access_status: 'approved',
            commission_enabled_on: enabled,
            is_active: true,
          });
        } else {
          agent = await tx.updateAgentAccess(agent.id, {
            access_status: 'approved',
            is_active: true,
            full_name: agent.full_name || reqRow.full_name || '',
            commission_enabled_on: enabled,
            set_commission_date: enabled != null,
          });
        }
        const request = await tx.decideAccessRequest(reqRow.id, { status: 'approved', decided_by: who });
        return { request: request, agent: publicAgent(agent) };
      });
    },

    adminReject(requestId, operator) {
      const who = cleanText(operator, 200, 'Operator') || 'admin';
      return store.transaction(async function (tx) {
        const reqRow = await tx.lockAccessRequest(requestId);
        if (!reqRow) throw httpError(404, 'So\'rov topilmadi');
        if (reqRow.status !== 'pending') throw httpError(409, 'So\'rov allaqachon ko\'rib chiqilgan');
        const agent = await tx.lockAgentByTelegram(reqRow.telegram_id);
        if (agent && agent.access_status === 'pending') {
          await tx.updateAgentAccess(agent.id, {
            access_status: 'rejected',
            is_active: false,
            full_name: agent.full_name,
            set_commission_date: false,
          });
        }
        const request = await tx.decideAccessRequest(reqRow.id, { status: 'rejected', decided_by: who });
        return { request: request };
      });
    },
  };
}

module.exports = {
  createAgentService: createAgentService,
  cleanCustomerFields: cleanCustomerFields,
  publicAgent: publicAgent,
};
