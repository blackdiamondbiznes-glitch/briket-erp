/**
 * Agent servisi uchun xotira ombori. SQL ombor bilan bir xil metodlar.
 * Testlar production bazasiga tegmaydi.
 */

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function blank() {
  return {
    agents: [],
    requests: [],
    customers: [],
    products: [],
    waybills: [],
    items: [],
    payments: [],
    allocations: [],
    events: [],
    withdrawals: [],
    orders: [],
    orderItems: [],
    erpPayments: [],
    stock: null,
    stockChecks: [],
    seq: {
      agent: 1,
      request: 1,
      customer: 1,
      waybill: 1,
      item: 1,
      payment: 1,
      allocation: 1,
      event: 1,
      withdrawal: 1,
      order: 1,
      erpPayment: 1,
    },
  };
}

function same(a, b) {
  return String(a) === String(b);
}

function createMemoryStore(initial) {
  const state = initial || blank();
  let depth = 0;

  function next(key) {
    const id = state.seq[key];
    state.seq[key] += 1;
    return id;
  }

  const api = {
    async transaction(fn) {
      if (depth > 0) return fn(api);
      const snap = clone(state);
      depth += 1;
      try {
        const result = await fn(api);
        depth -= 1;
        return result;
      } catch (err) {
        depth -= 1;
        const restored = clone(snap);
        Object.keys(state).forEach((k) => delete state[k]);
        Object.assign(state, restored);
        throw err;
      }
    },

    async getAgentByTelegram(telegramId) {
      return state.agents.find((a) => same(a.telegram_id, telegramId)) || null;
    },

    async getLatestAccessRequest(telegramId) {
      const rows = state.requests.filter((r) => same(r.telegram_id, telegramId));
      return rows.length ? rows[rows.length - 1] : null;
    },

    async insertAccessRequest(row) {
      const pending = state.requests.find((r) => same(r.telegram_id, row.telegram_id) && r.status === 'pending');
      if (pending) return Object.assign({}, pending, { already_pending: true });
      const created = {
        id: next('request'),
        telegram_id: String(row.telegram_id),
        telegram_username: row.telegram_username || null,
        full_name: row.full_name || '',
        status: 'pending',
        notify_message_id: row.notify_message_id,
        decided_at: null,
        decided_by: null,
        created_at: new Date().toISOString(),
      };
      state.requests.push(created);
      return created;
    },

    async listCustomers(agentId) {
      return state.customers
        .filter((c) => same(c.agent_id, agentId))
        .map((c) => Object.assign({}, c, { outstanding_debt: outstanding(c) }))
        .sort((a, b) => b.id - a.id);
    },

    async getCustomer(agentId, customerId) {
      return state.customers.find((c) => same(c.id, customerId) && same(c.agent_id, agentId)) || null;
    },

    async insertCustomer(agentId, fields) {
      const row = {
        id: next('customer'),
        name: fields.name,
        phone: fields.phone || null,
        address: fields.address || null,
        latitude: fields.latitude != null ? fields.latitude : null,
        longitude: fields.longitude != null ? fields.longitude : null,
        note: fields.note || null,
        agent_id: agentId,
        is_active: true,
        legacy_source: fields.legacy_source || null,
        legacy_id: fields.legacy_id || null,
      };
      state.customers.push(row);
      return row;
    },

    async updateCustomer(agentId, customerId, fields) {
      const row = await this.getCustomer(agentId, customerId);
      if (!row) return null;
      Object.keys(fields).forEach((k) => {
        row[k] = fields[k];
      });
      return row;
    },

    async deactivateCustomer(agentId, customerId) {
      const row = await this.getCustomer(agentId, customerId);
      if (!row) return null;
      row.is_active = false;
      return row;
    },

    async listActiveProducts() {
      return state.products.filter((p) => p.is_active !== false).map(publicProduct);
    },

    async getActiveProductsByIds(ids) {
      const want = (ids || []).map(String);
      return state.products.filter((p) => want.indexOf(String(p.id)) !== -1 && p.is_active !== false);
    },

    async saveWaybill(input) {
      const d = input.draft;
      const waybill = {
        id: next('waybill'),
        waybill_code: input.code,
        agent_id: input.agentId,
        customer_id: input.customerId,
        total_amount: d.total_amount,
        paid_amount: d.paid_amount,
        debt_amount: d.debt_amount,
        commission_amount: d.commission_amount,
        due_date: d.due_date,
        status: d.status,
        note: d.note,
        idempotency_key: input.idempotencyKey || null,
        order_id: null,
        order_code: null,
        created_at: new Date().toISOString(),
        customer_name: (state.customers.find((c) => same(c.id, input.customerId)) || {}).name || null,
        agent_name: (state.agents.find((a) => same(a.id, input.agentId)) || {}).full_name || null,
      };
      state.waybills.push(waybill);
      const items = d.items.map((it) => {
        const row = Object.assign({ id: next('item'), waybill_id: waybill.id }, it);
        state.items.push(row);
        return row;
      });
      if (Number(input.commissionNow) > 0) {
        state.events.push({
          id: next('event'),
          agent_id: input.agentId,
          customer_id: input.customerId,
          waybill_id: waybill.id,
          debt_payment_id: null,
          amount: input.commissionNow,
          source: 'order',
          created_at: waybill.created_at,
        });
      }
      waybill.items = items;
      waybill.commission_earned_now = Number(input.commissionNow) || 0;
      return waybill;
    },

    async listWaybills(agentId) {
      return state.waybills
        .filter((w) => same(w.agent_id, agentId))
        .sort((a, b) => b.id - a.id)
        .map(withItems);
    },

    async getWaybill(agentId, waybillId) {
      const row = state.waybills.find((w) => same(w.id, waybillId) && same(w.agent_id, agentId));
      return row ? withItems(row) : null;
    },

    async listOpenWaybillsWithEarned(agentId, customerId) {
      return state.waybills
        .filter((w) => same(w.agent_id, agentId) && same(w.customer_id, customerId) && Number(w.debt_amount) > 0)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id)
        .map((w) =>
          Object.assign({}, w, {
            commission_earned: state.events
              .filter((e) => same(e.waybill_id, w.id))
              .reduce((s, e) => s + Number(e.amount), 0),
          })
        );
    },

    async saveDebtCollection(input) {
      const payment = {
        id: next('payment'),
        agent_id: input.agentId,
        customer_id: input.customerId,
        amount: input.amount,
        notes: input.notes,
        applied_to_waybills: true,
        created_at: new Date().toISOString(),
      };
      state.payments.push(payment);
      payment.allocations = input.allocations.map((a) => {
        const alloc = {
          id: next('allocation'),
          debt_payment_id: payment.id,
          waybill_id: a.waybill_id,
          amount: a.amount,
          commission_amount: a.commission_amount,
        };
        state.allocations.push(alloc);
        const waybill = state.waybills.find((w) => same(w.id, a.waybill_id) && same(w.agent_id, input.agentId));
        if (waybill && Number(waybill.debt_amount) >= Number(a.amount)) {
          waybill.paid_amount = Number(waybill.paid_amount) + Number(a.amount);
          waybill.debt_amount = Number(waybill.debt_amount) - Number(a.amount);
          waybill.status = waybill.debt_amount <= 0 ? 'paid' : 'partial';
        }
        if (Number(a.commission_amount) > 0) {
          state.events.push({
            id: next('event'),
            agent_id: input.agentId,
            customer_id: input.customerId,
            waybill_id: a.waybill_id,
            debt_payment_id: payment.id,
            amount: a.commission_amount,
            source: 'debt_payment',
            created_at: payment.created_at,
          });
        }
        return alloc;
      });
      return payment;
    },

    async listDebtPayments(agentId) {
      return state.payments.filter((p) => same(p.agent_id, agentId)).sort((a, b) => b.id - a.id);
    },

    async commissionTotals(agentId) {
      const earned = state.events.filter((e) => same(e.agent_id, agentId)).reduce((s, e) => s + Number(e.amount), 0);
      const withdrawn = state.withdrawals
        .filter((w) => same(w.agent_id, agentId))
        .reduce((s, w) => s + Number(w.amount), 0);
      return { earned: earned, withdrawn: withdrawn };
    },

    async listCommissionEvents(agentId) {
      return state.events.filter((e) => same(e.agent_id, agentId)).sort((a, b) => b.id - a.id);
    },

    async listWithdrawals(agentId) {
      return state.withdrawals.filter((w) => same(w.agent_id, agentId)).sort((a, b) => b.id - a.id);
    },

    async lockAgent(agentId) {
      return state.agents.find((a) => same(a.id, agentId)) || null;
    },

    async insertWithdrawal(input) {
      const row = {
        id: next('withdrawal'),
        agent_id: input.agentId,
        amount: input.amount,
        notes: input.notes,
        created_at: new Date().toISOString(),
      };
      state.withdrawals.push(row);
      return row;
    },

    async adminListAgents() {
      return state.agents
        .slice()
        .sort((a, b) => b.id - a.id)
        .map((a) => {
          const earned = state.events.filter((e) => same(e.agent_id, a.id)).reduce((s, e) => s + Number(e.amount), 0);
          const withdrawn = state.withdrawals
            .filter((w) => same(w.agent_id, a.id))
            .reduce((s, w) => s + Number(w.amount), 0);
          const debt = state.waybills
            .filter((w) => same(w.agent_id, a.id))
            .reduce((s, w) => s + Number(w.debt_amount), 0);
          const unapplied = state.payments
            .filter((p) => same(p.agent_id, a.id) && p.applied_to_waybills === false)
            .reduce((s, p) => s + Number(p.amount), 0);
          return Object.assign({}, a, {
            commission_earned: earned,
            commission_withdrawn: withdrawn,
            commission_balance: earned - withdrawn,
            debt_total: Math.max(0, debt - unapplied),
          });
        });
    },

    async adminListRequests(status) {
      return state.requests
        .filter((r) => !status || r.status === status)
        .sort((a, b) => b.id - a.id);
    },

    async lockAccessRequest(id) {
      return state.requests.find((r) => same(r.id, id)) || null;
    },

    async lockAgentByTelegram(telegramId) {
      return this.getAgentByTelegram(telegramId);
    },

    async insertAgent(row) {
      const agent = {
        id: next('agent'),
        telegram_id: String(row.telegram_id),
        telegram_username: row.telegram_username || null,
        full_name: row.full_name || '',
        email: row.email || null,
        role: row.role || 'agent',
        access_status: row.access_status || 'pending',
        commission_enabled_on: row.commission_enabled_on || null,
        is_active: row.is_active !== false,
      };
      state.agents.push(agent);
      return agent;
    },

    async updateAgentAccess(id, fields) {
      const agent = state.agents.find((a) => same(a.id, id));
      if (!agent) return null;
      agent.access_status = fields.access_status;
      agent.is_active = fields.is_active !== false;
      if (!agent.full_name) agent.full_name = fields.full_name || '';
      if (fields.set_commission_date) agent.commission_enabled_on = fields.commission_enabled_on || null;
      return agent;
    },

    async decideAccessRequest(id, fields) {
      const row = state.requests.find((r) => same(r.id, id));
      if (!row) return null;
      row.status = fields.status;
      row.decided_by = fields.decided_by;
      row.decided_at = new Date().toISOString();
      return row;
    },

    async adminListWaybills(agentId, scope) {
      return state.waybills
        .filter((w) => {
          if (scope === 'admin') return w.agent_id == null;
          return !agentId || same(w.agent_id, agentId);
        })
        .sort((a, b) => b.id - a.id)
        .map(withItems);
    },

    async insertPlainCustomer(row) {
      const created = {
        id: next('customer'),
        name: row.name,
        phone: row.phone || null,
        address: row.address || null,
        telegram_id: row.telegram_id || null,
        credit_limit: row.credit_limit || 0,
        agent_id: null,
        is_active: row.is_active !== false,
      };
      state.customers.push(created);
      return created;
    },

    async setStock(map) {
      state.stock = Object.assign({}, map);
    },

    stockSnapshot() {
      return Object.assign({}, state.stock || {});
    },

    async listOrders() {
      return state.orders.map((o) => Object.assign({}, o, {
        items: state.orderItems.filter((it) => same(it.order_id, o.id)),
      }));
    },

    async listErpPayments() {
      return state.erpPayments.slice();
    },

    stockCheckCount() {
      return state.stockChecks.length;
    },

    async getCustomerById(customerId) {
      return state.customers.find((c) => same(c.id, customerId)) || null;
    },

    async findWaybillByIdempotency(key) {
      if (!key) return null;
      const row = state.waybills.find((w) => w.idempotency_key && same(w.idempotency_key, key));
      return row ? withItems(row) : null;
    },

    async lockWaybill(waybillId) {
      return state.waybills.find((w) => same(w.id, waybillId)) || null;
    },

    async getAdminWaybill(waybillId) {
      const row = state.waybills.find((w) => same(w.id, waybillId));
      if (!row) return null;
      const full = withItems(row);
      const customer = state.customers.find((c) => same(c.id, row.customer_id));
      full.customer_telegram_id = customer ? customer.telegram_id : null;
      const order = state.orders.find((o) => same(o.id, row.order_id));
      full.order_code = order ? order.order_code : row.order_code;
      return full;
    },

    async assertStock(lines) {
      state.stockChecks.push((lines || []).map((l) => ({ product_id: l.product_id, qty: l.qty })));
      if (!state.stock) return;
      const need = {};
      (lines || []).forEach((line) => {
        const k = String(line.product_id);
        need[k] = (need[k] || 0) + Number(line.qty);
      });
      Object.keys(need).forEach((k) => {
        const have = Number(state.stock[k] || 0);
        if (need[k] > have + 0.0001) {
          const err = new Error('Zaxira yetarli emas: #' + k + ' (bor: ' + have + ' dona, kerak: ' + need[k] + ' dona)');
          err.status = 400;
          throw err;
        }
      });
    },

    async insertSoldOrder(input) {
      const id = next('order');
      const code = 'ORD-' + input.day + '-' + String(id).padStart(6, '0');
      const order = {
        id: id,
        order_code: code,
        customer_id: input.customerId,
        customer_name: input.customerName,
        phone: input.phone || null,
        status: input.status,
        total_amount: input.total,
        paid_amount: input.paid,
        debt_amount: input.debt,
        debt_due: input.due || null,
        source: 'yuk_xati',
        note: input.note || null,
      };
      state.orders.push(order);
      input.lines.forEach((line) => {
        state.orderItems.push({
          id: state.orderItems.length + 1,
          order_id: id,
          product_id: line.product_id,
          sku: line.sku,
          qty: line.qty,
          unit_price: line.unit_price,
          line_total: line.line_total,
        });
        if (state.stock) {
          const k = String(line.product_id);
          state.stock[k] = Number(state.stock[k] || 0) - Number(line.qty);
        }
      });
      if (Number(input.paid) > 0) {
        state.erpPayments.push({
          id: next('erpPayment'),
          order_id: id,
          customer_id: input.customerId,
          amount: input.paid,
          method: 'cash',
          note: 'Yuk xati boshlang\'ich to\'lov',
        });
      }
      return order;
    },

    async attachOrder(waybillId, orderId, orderCode) {
      const waybill = state.waybills.find((w) => same(w.id, waybillId));
      if (!waybill || waybill.order_id != null) {
        const err = new Error('Yuk xati buyurtmasi allaqachon bog\'langan');
        err.status = 409;
        err.code = '23505';
        throw err;
      }
      waybill.order_id = orderId;
      waybill.order_code = orderCode;
      return waybill;
    },

    async applyAdminPayment(input) {
      const waybill = state.waybills.find((w) => same(w.id, input.waybillId));
      if (!waybill || Number(waybill.debt_amount) < Number(input.amount)) return null;
      waybill.paid_amount = Number(waybill.paid_amount) + Number(input.amount);
      waybill.debt_amount = Number(waybill.debt_amount) - Number(input.amount);
      waybill.status = waybill.debt_amount <= 0 ? 'paid' : 'partial';
      let order = null;
      if (input.orderId) {
        order = state.orders.find((o) => same(o.id, input.orderId)) || null;
        if (order && Number(order.debt_amount) >= Number(input.amount)) {
          order.paid_amount = Number(order.paid_amount) + Number(input.amount);
          order.debt_amount = Number(order.debt_amount) - Number(input.amount);
          order.status = order.debt_amount <= 0 ? 'paid' : 'partial';
          state.erpPayments.push({
            id: next('erpPayment'),
            order_id: order.id,
            customer_id: input.customerId,
            amount: input.amount,
            method: input.method || 'cash',
            note: input.note || 'Yuk xati qarz to\'lovi',
          });
        }
      }
      const full = withItems(waybill);
      full.order = order;
      full.order_code = order ? order.order_code : waybill.order_code;
      return full;
    },

    async adminDebts(agentId) {
      return state.customers
        .filter((c) => c.agent_id != null && (!agentId || same(c.agent_id, agentId)))
        .map((c) => {
          const agent = state.agents.find((a) => same(a.id, c.agent_id));
          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            agent_id: c.agent_id,
            agent_name: agent ? agent.full_name : '',
            outstanding_debt: outstanding(c),
          };
        });
    },
  };

  function outstanding(customer) {
    const debt = state.waybills
      .filter((w) => same(w.customer_id, customer.id) && same(w.agent_id, customer.agent_id))
      .reduce((s, w) => s + Number(w.debt_amount), 0);
    const unapplied = state.payments
      .filter((p) => same(p.customer_id, customer.id) && same(p.agent_id, customer.agent_id) && p.applied_to_waybills === false)
      .reduce((s, p) => s + Number(p.amount), 0);
    return Math.max(0, debt - unapplied);
  }

  function withItems(waybill) {
    const customer = state.customers.find((c) => same(c.id, waybill.customer_id));
    const agent = state.agents.find((a) => same(a.id, waybill.agent_id));
    return Object.assign({}, waybill, {
      customer_name: customer ? customer.name : waybill.customer_name || null,
      customer_phone: customer ? customer.phone : null,
      customer_address: customer ? customer.address : null,
      agent_name: agent ? agent.full_name : waybill.agent_name || null,
      items: state.items.filter((it) => same(it.waybill_id, waybill.id)),
    });
  }

  function publicProduct(p) {
    return { id: p.id, sku: p.sku, weight_kg: p.weight_kg, price: p.price, description: p.description || null };
  }

  return api;
}

module.exports = { createMemoryStore: createMemoryStore, blank: blank };
