/**
 * SQL ombor. Barcha qiymatlar parametr. Jadval yo'q bo'lsa chaqiruvchi 42P01 ni ushlaydi.
 */

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function createSqlStore(pool) {
  function bind(q) {
    return {
      query(sql, params) {
        return q.query(sql, params);
      },

      async transaction(fn) {
        if (q !== pool) return fn(bind(q));
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(bind(client));
          await client.query('COMMIT');
          return result;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch (e) {}
          throw err;
        } finally {
          client.release();
        }
      },

      async getAgentByTelegram(telegramId) {
        const r = await q.query('SELECT * FROM agents WHERE telegram_id = $1 LIMIT 1', [telegramId]);
        return r.rows[0] || null;
      },

      async getLatestAccessRequest(telegramId) {
        const r = await q.query(
          'SELECT * FROM agent_access_requests WHERE telegram_id = $1 ORDER BY id DESC LIMIT 1',
          [telegramId]
        );
        return r.rows[0] || null;
      },

      async insertAccessRequest(row) {
        const existing = await q.query(
          `SELECT * FROM agent_access_requests
           WHERE telegram_id = $1 AND status = 'pending' LIMIT 1`,
          [row.telegram_id]
        );
        if (existing.rows.length) {
          return Object.assign({}, existing.rows[0], { already_pending: true });
        }
        try {
          const r = await q.query(
            `INSERT INTO agent_access_requests
               (telegram_id, telegram_username, full_name, status, notify_message_id)
             VALUES ($1, $2, $3, 'pending', $4)
             RETURNING *`,
            [row.telegram_id, row.telegram_username, row.full_name, row.notify_message_id]
          );
          return r.rows[0];
        } catch (err) {
          if (err && err.code === '23505') {
            const again = await q.query(
              `SELECT * FROM agent_access_requests
               WHERE telegram_id = $1 AND status = 'pending' LIMIT 1`,
              [row.telegram_id]
            );
            if (again.rows.length) return Object.assign({}, again.rows[0], { already_pending: true });
          }
          throw err;
        }
      },

      async listCustomers(agentId) {
        const r = await q.query(
          `SELECT c.*,
             GREATEST(
               0,
               COALESCE((
                 SELECT SUM(w.debt_amount) FROM waybills w
                 WHERE w.customer_id = c.id AND w.agent_id = c.agent_id
               ), 0)
               - COALESCE((
                 SELECT SUM(p.amount) FROM agent_debt_payments p
                 WHERE p.customer_id = c.id AND p.agent_id = c.agent_id
                   AND p.applied_to_waybills = false
               ), 0)
             ) AS outstanding_debt
           FROM customers c
           WHERE c.agent_id = $1
           ORDER BY c.id DESC`,
          [agentId]
        );
        return r.rows.map(function (row) {
          row.outstanding_debt = n(row.outstanding_debt);
          return row;
        });
      },

      async getCustomer(agentId, customerId, opts) {
        const lock = opts && opts.lock ? ' FOR UPDATE' : '';
        const r = await q.query(
          'SELECT * FROM customers WHERE id = $1 AND agent_id = $2' + lock,
          [customerId, agentId]
        );
        return r.rows[0] || null;
      },

      async insertCustomer(agentId, fields) {
        const r = await q.query(
          `INSERT INTO customers
             (name, phone, address, latitude, longitude, note, agent_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           RETURNING *`,
          [
            fields.name,
            fields.phone || null,
            fields.address || null,
            fields.latitude != null ? fields.latitude : null,
            fields.longitude != null ? fields.longitude : null,
            fields.note || null,
            agentId,
          ]
        );
        return r.rows[0];
      },

      async updateCustomer(agentId, customerId, fields) {
        const current = await this.getCustomer(agentId, customerId);
        if (!current) return null;
        const next = {
          name: Object.prototype.hasOwnProperty.call(fields, 'name') ? fields.name : current.name,
          phone: Object.prototype.hasOwnProperty.call(fields, 'phone') ? fields.phone : current.phone,
          address: Object.prototype.hasOwnProperty.call(fields, 'address') ? fields.address : current.address,
          latitude: Object.prototype.hasOwnProperty.call(fields, 'latitude') ? fields.latitude : current.latitude,
          longitude: Object.prototype.hasOwnProperty.call(fields, 'longitude') ? fields.longitude : current.longitude,
          note: Object.prototype.hasOwnProperty.call(fields, 'note') ? fields.note : current.note,
        };
        const r = await q.query(
          `UPDATE customers SET
             name = $1, phone = $2, address = $3, latitude = $4, longitude = $5, note = $6, updated_at = NOW()
           WHERE id = $7 AND agent_id = $8
           RETURNING *`,
          [next.name, next.phone, next.address, next.latitude, next.longitude, next.note, customerId, agentId]
        );
        return r.rows[0] || null;
      },

      async deactivateCustomer(agentId, customerId) {
        const r = await q.query(
          `UPDATE customers SET is_active = false, updated_at = NOW()
           WHERE id = $1 AND agent_id = $2
           RETURNING *`,
          [customerId, agentId]
        );
        return r.rows[0] || null;
      },

      async listActiveProducts() {
        const r = await q.query(
          `SELECT id, sku, weight_kg, price, description
           FROM products WHERE is_active = true ORDER BY id`
        );
        return r.rows;
      },

      async getActiveProductsByIds(ids) {
        if (!ids || !ids.length) return [];
        const r = await q.query(
          `SELECT id, sku, weight_kg, price, is_active
           FROM products WHERE id = ANY($1::int[]) AND is_active = true`,
          [ids.map((id) => Number(id))]
        );
        return r.rows;
      },

      async saveWaybill(input) {
        const d = input.draft;
        const withReys = input.reysId != null;
        const w = await q.query(
          withReys
            ? `INSERT INTO waybills
                 (waybill_code, agent_id, customer_id, total_amount, paid_amount, debt_amount,
                  commission_amount, due_date, status, note, idempotency_key, stock_posted, reys_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               RETURNING *`
            : `INSERT INTO waybills
                 (waybill_code, agent_id, customer_id, total_amount, paid_amount, debt_amount,
                  commission_amount, due_date, status, note, idempotency_key, stock_posted)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
               RETURNING *`,
          [
            input.code,
            input.agentId != null ? input.agentId : null,
            input.customerId,
            d.total_amount,
            d.paid_amount,
            d.debt_amount,
            d.commission_amount,
            d.due_date,
            d.status,
            d.note,
            input.idempotencyKey || null,
            input.stockPosted === true,
          ].concat(withReys ? [input.reysId] : [])
        );
        const waybill = w.rows[0];
        const items = [];
        for (let i = 0; i < d.items.length; i++) {
          const it = d.items[i];
          const ir = await q.query(
            `INSERT INTO waybill_items
               (waybill_id, product_id, product_name, quantity, price, subtotal, commission)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING *`,
            [waybill.id, it.product_id, it.product_name, it.quantity, it.price, it.subtotal, it.commission]
          );
          items.push(ir.rows[0]);
        }
        if (n(input.commissionNow) > 0) {
          await q.query(
            `INSERT INTO agent_commission_events
               (agent_id, customer_id, waybill_id, amount, source)
             VALUES ($1,$2,$3,$4,'order')`,
            [input.agentId, input.customerId, waybill.id, input.commissionNow]
          );
        }
        waybill.items = items;
        waybill.commission_earned_now = n(input.commissionNow);
        return waybill;
      },

      async listWaybills(agentId) {
        const r = await q.query(
          `SELECT w.*, c.name AS customer_name, c.phone AS customer_phone
           FROM waybills w
           LEFT JOIN customers c ON c.id = w.customer_id
           WHERE w.agent_id = $1
           ORDER BY w.id DESC
           LIMIT 200`,
          [agentId]
        );
        return attachItems(q, r.rows);
      },

      async getWaybill(agentId, waybillId) {
        const r = await q.query(
          `SELECT w.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
                  a.full_name AS agent_name
           FROM waybills w
           JOIN agents a ON a.id = w.agent_id
           LEFT JOIN customers c ON c.id = w.customer_id
           WHERE w.id = $1 AND w.agent_id = $2`,
          [waybillId, agentId]
        );
        if (!r.rows.length) return null;
        const rows = await attachItems(q, r.rows);
        return rows[0];
      },

      async listOpenWaybillsWithEarned(agentId, customerId) {
        const r = await q.query(
          `SELECT w.*,
             COALESCE((
               SELECT SUM(e.amount) FROM agent_commission_events e WHERE e.waybill_id = w.id
             ), 0) AS commission_earned
           FROM waybills w
           WHERE w.agent_id = $1 AND w.customer_id = $2 AND w.debt_amount > 0
           ORDER BY w.created_at ASC, w.id ASC
           FOR UPDATE OF w`,
          [agentId, customerId]
        );
        return r.rows.map(function (row) {
          row.commission_earned = n(row.commission_earned);
          row.debt_amount = n(row.debt_amount);
          row.total_amount = n(row.total_amount);
          row.commission_amount = n(row.commission_amount);
          return row;
        });
      },

      async saveDebtCollection(input) {
        const pay = await q.query(
          `INSERT INTO agent_debt_payments
             (agent_id, customer_id, amount, notes, applied_to_waybills)
           VALUES ($1,$2,$3,$4,true)
           RETURNING *`,
          [input.agentId, input.customerId, input.amount, input.notes]
        );
        const payment = pay.rows[0];
        const allocations = [];
        for (let i = 0; i < input.allocations.length; i++) {
          const a = input.allocations[i];
          const ar = await q.query(
            `INSERT INTO agent_debt_allocations
               (debt_payment_id, waybill_id, amount, commission_amount)
             VALUES ($1,$2,$3,$4)
             RETURNING *`,
            [payment.id, a.waybill_id, a.amount, a.commission_amount]
          );
          allocations.push(ar.rows[0]);
          await q.query(
            `UPDATE waybills SET
               paid_amount = paid_amount + $1,
               debt_amount = debt_amount - $1,
               status = CASE
                 WHEN debt_amount - $1 <= 0 THEN 'paid'
                 WHEN paid_amount + $1 > 0 THEN 'partial'
                 ELSE status
               END,
               updated_at = NOW()
             WHERE id = $2 AND agent_id = $3 AND debt_amount >= $1`,
            [a.amount, a.waybill_id, input.agentId]
          );
          if (n(a.commission_amount) > 0) {
            await q.query(
              `INSERT INTO agent_commission_events
                 (agent_id, customer_id, waybill_id, debt_payment_id, amount, source)
               VALUES ($1,$2,$3,$4,$5,'debt_payment')`,
              [input.agentId, input.customerId, a.waybill_id, payment.id, a.commission_amount]
            );
          }
        }
        payment.allocations = allocations;
        return payment;
      },

      async listDebtPayments(agentId) {
        const r = await q.query(
          `SELECT p.*, c.name AS customer_name
           FROM agent_debt_payments p
           LEFT JOIN customers c ON c.id = p.customer_id
           WHERE p.agent_id = $1
           ORDER BY p.id DESC
           LIMIT 200`,
          [agentId]
        );
        return r.rows;
      },

      async commissionTotals(agentId) {
        const ev = await q.query(
          'SELECT COALESCE(SUM(amount),0) AS earned FROM agent_commission_events WHERE agent_id = $1',
          [agentId]
        );
        const wd = await q.query(
          'SELECT COALESCE(SUM(amount),0) AS withdrawn FROM agent_commission_withdrawals WHERE agent_id = $1',
          [agentId]
        );
        return { earned: n(ev.rows[0].earned), withdrawn: n(wd.rows[0].withdrawn) };
      },

      async listCommissionEvents(agentId) {
        const r = await q.query(
          `SELECT * FROM agent_commission_events WHERE agent_id = $1 ORDER BY id DESC LIMIT 100`,
          [agentId]
        );
        return r.rows;
      },

      async listWithdrawals(agentId) {
        const r = await q.query(
          `SELECT * FROM agent_commission_withdrawals WHERE agent_id = $1 ORDER BY id DESC LIMIT 100`,
          [agentId]
        );
        return r.rows;
      },

      async lockAgent(agentId) {
        const r = await q.query('SELECT * FROM agents WHERE id = $1 FOR UPDATE', [agentId]);
        return r.rows[0] || null;
      },

      async insertWithdrawal(input) {
        const r = await q.query(
          `INSERT INTO agent_commission_withdrawals (agent_id, amount, notes)
           VALUES ($1,$2,$3) RETURNING *`,
          [input.agentId, input.amount, input.notes]
        );
        return r.rows[0];
      },

      async adminListAgents() {
        const r = await q.query(
          `SELECT a.*,
             COALESCE(ev.earned, 0) AS commission_earned,
             COALESCE(wd.withdrawn, 0) AS commission_withdrawn,
             GREATEST(0, COALESCE(db.debt, 0) - COALESCE(up.unapplied, 0)) AS debt_total
           FROM agents a
           LEFT JOIN (
             SELECT agent_id, SUM(amount) AS earned FROM agent_commission_events GROUP BY agent_id
           ) ev ON ev.agent_id = a.id
           LEFT JOIN (
             SELECT agent_id, SUM(amount) AS withdrawn FROM agent_commission_withdrawals GROUP BY agent_id
           ) wd ON wd.agent_id = a.id
           LEFT JOIN (
             SELECT agent_id, SUM(debt_amount) AS debt FROM waybills GROUP BY agent_id
           ) db ON db.agent_id = a.id
           LEFT JOIN (
             SELECT agent_id, SUM(amount) AS unapplied
             FROM agent_debt_payments WHERE applied_to_waybills = false
             GROUP BY agent_id
           ) up ON up.agent_id = a.id
           ORDER BY a.id DESC`
        );
        return r.rows.map(function (row) {
          row.commission_earned = n(row.commission_earned);
          row.commission_withdrawn = n(row.commission_withdrawn);
          row.debt_total = n(row.debt_total);
          row.commission_balance = row.commission_earned - row.commission_withdrawn;
          return row;
        });
      },

      async adminListRequests(status) {
        const params = [];
        let sql = 'SELECT * FROM agent_access_requests';
        if (status) {
          params.push(status);
          sql += ' WHERE status = $1';
        }
        sql += ' ORDER BY id DESC LIMIT 200';
        const r = await q.query(sql, params);
        return r.rows;
      },

      async lockAccessRequest(id) {
        const r = await q.query('SELECT * FROM agent_access_requests WHERE id = $1 FOR UPDATE', [id]);
        return r.rows[0] || null;
      },

      async lockAgentByTelegram(telegramId) {
        const r = await q.query('SELECT * FROM agents WHERE telegram_id = $1 FOR UPDATE', [telegramId]);
        return r.rows[0] || null;
      },

      async insertAgent(row) {
        const r = await q.query(
          `INSERT INTO agents
             (telegram_id, telegram_username, full_name, role, access_status, commission_enabled_on, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [
            row.telegram_id,
            row.telegram_username || null,
            row.full_name || '',
            row.role || 'agent',
            row.access_status || 'pending',
            row.commission_enabled_on || null,
            row.is_active !== false,
          ]
        );
        return r.rows[0];
      },

      async updateAgentAccess(id, fields) {
        const r = await q.query(
          `UPDATE agents SET
             access_status = $1,
             is_active = $2,
             full_name = CASE WHEN full_name IS NULL OR full_name = '' THEN $3 ELSE full_name END,
             commission_enabled_on = CASE WHEN $4::boolean THEN $5::date ELSE commission_enabled_on END,
             updated_at = NOW()
           WHERE id = $6
           RETURNING *`,
          [
            fields.access_status,
            fields.is_active !== false,
            fields.full_name || '',
            fields.set_commission_date === true,
            fields.commission_enabled_on || null,
            id,
          ]
        );
        return r.rows[0] || null;
      },

      async decideAccessRequest(id, fields) {
        const r = await q.query(
          `UPDATE agent_access_requests
           SET status = $1, decided_at = NOW(), decided_by = $2
           WHERE id = $3
           RETURNING *`,
          [fields.status, fields.decided_by, id]
        );
        return r.rows[0];
      },

      async adminListWaybills(agentId, scope) {
        const params = [];
        let sql =
          `SELECT w.*, c.name AS customer_name, c.phone AS customer_phone,
                  c.telegram_id AS customer_telegram_id, a.full_name AS agent_name,
                  o.order_code
           FROM waybills w
           LEFT JOIN agents a ON a.id = w.agent_id
           LEFT JOIN customers c ON c.id = w.customer_id
           LEFT JOIN orders o ON o.id = w.order_id`;
        if (scope === 'admin') {
          sql += ' WHERE w.agent_id IS NULL';
        } else if (agentId) {
          params.push(agentId);
          sql += ' WHERE w.agent_id = $1';
        }
        sql += ' ORDER BY w.id DESC LIMIT 200';
        const r = await q.query(sql, params);
        return attachItems(q, r.rows);
      },

      async getCustomerById(customerId) {
        const r = await q.query(
          `SELECT id, name, phone, address, is_active, telegram_id, credit_limit, agent_id
           FROM customers WHERE id = $1 FOR UPDATE`,
          [customerId]
        );
        return r.rows[0] || null;
      },

      async findWaybillByIdempotency(key) {
        if (!key) return null;
        const r = await q.query(
          `SELECT w.*, c.name AS customer_name, c.phone AS customer_phone,
                  c.address AS customer_address, c.telegram_id AS customer_telegram_id,
                  o.order_code
           FROM waybills w
           LEFT JOIN customers c ON c.id = w.customer_id
           LEFT JOIN orders o ON o.id = w.order_id
           WHERE w.idempotency_key = $1
           LIMIT 1`,
          [key]
        );
        if (!r.rows.length) return null;
        const rows = await attachItems(q, r.rows);
        return rows[0];
      },

      async lockWaybill(waybillId) {
        const r = await q.query('SELECT * FROM waybills WHERE id = $1 FOR UPDATE', [waybillId]);
        return r.rows[0] || null;
      },

      async getAdminWaybill(waybillId) {
        const r = await q.query(
          `SELECT w.*, c.name AS customer_name, c.phone AS customer_phone,
                  c.address AS customer_address, c.telegram_id AS customer_telegram_id,
                  a.full_name AS agent_name, o.order_code
           FROM waybills w
           LEFT JOIN agents a ON a.id = w.agent_id
           LEFT JOIN customers c ON c.id = w.customer_id
           LEFT JOIN orders o ON o.id = w.order_id
           WHERE w.id = $1`,
          [waybillId]
        );
        if (!r.rows.length) return null;
        const rows = await attachItems(q, r.rows);
        return rows[0];
      },

      async applyAdminPayment(input) {
        const waybillR = await q.query(
          `UPDATE waybills SET
             paid_amount = paid_amount + $1,
             debt_amount = debt_amount - $1,
             status = CASE
               WHEN debt_amount - $1 <= 0 THEN 'paid'
               WHEN paid_amount + $1 > 0 THEN 'partial'
               ELSE status
             END,
             updated_at = NOW()
           WHERE id = $2 AND debt_amount >= $1
           RETURNING *`,
          [input.amount, input.waybillId]
        );
        if (!waybillR.rows.length) return null;
        const waybill = waybillR.rows[0];
        await q.query(
          `INSERT INTO payments (order_id, customer_id, amount, method, note)
           VALUES (NULL,$1,$2,$3,$4)`,
          [
            input.customerId,
            input.amount,
            input.method || 'cash',
            input.note || 'Yuk xati qarz to\'lovi',
          ]
        );
        return waybill;
      },

      async insertFieldPayment(input) {
        const r = await q.query(
          `INSERT INTO payments (order_id, customer_id, amount, method, note)
           VALUES (NULL,$1,$2,$3,$4)
           RETURNING *`,
          [input.customerId, input.amount, input.method || 'cash', input.note || null]
        );
        return r.rows[0];
      },

      async adminDebts(agentId) {
        const params = [];
        let where = 'WHERE c.agent_id IS NOT NULL';
        if (agentId) {
          params.push(agentId);
          where += ' AND c.agent_id = $1';
        }
        const r = await q.query(
          `SELECT c.id, c.name, c.phone, c.agent_id, a.full_name AS agent_name,
             GREATEST(
               0,
               COALESCE((
                 SELECT SUM(w.debt_amount) FROM waybills w
                 WHERE w.customer_id = c.id AND w.agent_id = c.agent_id
               ), 0)
               - COALESCE((
                 SELECT SUM(p.amount) FROM agent_debt_payments p
                 WHERE p.customer_id = c.id AND p.agent_id = c.agent_id
                   AND p.applied_to_waybills = false
               ), 0)
             ) AS outstanding_debt
           FROM customers c
           JOIN agents a ON a.id = c.agent_id
           ${where}
           ORDER BY outstanding_debt DESC, c.id DESC
           LIMIT 300`,
          params
        );
        return r.rows.map(function (row) {
          row.outstanding_debt = n(row.outstanding_debt);
          return row;
        });
      },

      async findReysByIdempotency(key) {
        if (!key) return null;
        const r = await q.query(
          'SELECT * FROM reyslar WHERE idempotency_key = $1 LIMIT 1',
          [key]
        );
        return r.rows[0] || null;
      },

      async findOpenReys() {
        const r = await q.query(
          `SELECT * FROM reyslar WHERE status = 'open' ORDER BY id DESC LIMIT 1`
        );
        return r.rows[0] || null;
      },

      async lockReys(reysId) {
        const r = await q.query('SELECT * FROM reyslar WHERE id = $1 FOR UPDATE', [reysId]);
        return r.rows[0] || null;
      },

      async getReys(reysId) {
        const r = await q.query('SELECT * FROM reyslar WHERE id = $1', [reysId]);
        return r.rows[0] || null;
      },

      async listReyslar() {
        const r = await q.query('SELECT * FROM reyslar ORDER BY id DESC LIMIT 30');
        return r.rows;
      },

      async listReysItems(reysId) {
        const r = await q.query(
          `SELECT ri.*, p.sku
           FROM reys_items ri
           LEFT JOIN products p ON p.id = ri.product_id
           WHERE ri.reys_id = $1
           ORDER BY ri.id`,
          [reysId]
        );
        return r.rows;
      },

      async listWaybillsByReys(reysId) {
        const r = await q.query(
          `SELECT w.*, c.name AS customer_name
           FROM waybills w
           LEFT JOIN customers c ON c.id = w.customer_id
           WHERE w.reys_id = $1
           ORDER BY w.id`,
          [reysId]
        );
        return attachItems(q, r.rows);
      },

      async saveReys(input) {
        const ins = await q.query(
          `INSERT INTO reyslar (reys_code, status, note, idempotency_key)
           VALUES ($1, 'open', $2, $3)
           RETURNING *`,
          [input.code, input.note || null, input.idempotencyKey || null]
        );
        const reys = ins.rows[0];
        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i];
          await q.query(
            `INSERT INTO reys_items (reys_id, product_id, loaded_qty, returned_qty)
             VALUES ($1,$2,$3,0)`,
            [reys.id, line.product_id, line.quantity]
          );
        }
        return reys;
      },

      async setReturnedQty(itemId, qty) {
        const r = await q.query(
          'UPDATE reys_items SET returned_qty = $2 WHERE id = $1 RETURNING *',
          [itemId, qty]
        );
        return r.rows[0] || null;
      },

      async markReysClosed(reysId) {
        const r = await q.query(
          `UPDATE reyslar
             SET status = 'closed', closed_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'open'
           RETURNING *`,
          [reysId]
        );
        return r.rows[0] || null;
      },
    };
  }

  return bind(pool);
}

async function attachItems(q, waybills) {
  if (!waybills.length) return [];
  const ids = waybills.map((w) => w.id);
  const items = await q.query(
    'SELECT * FROM waybill_items WHERE waybill_id = ANY($1::bigint[]) ORDER BY id',
    [ids]
  );
  const by = {};
  items.rows.forEach(function (it) {
    const key = String(it.waybill_id);
    if (!by[key]) by[key] = [];
    by[key].push(it);
  });
  return waybills.map(function (w) {
    w.items = by[String(w.id)] || [];
    return w;
  });
}

module.exports = { createSqlStore: createSqlStore };
