/**
 * Egasi yuk xati SQL. Har bir do'kon/yuk xati so'rovi agent_id IS NULL.
 * Pul: payment_allocations yig'indisi. paid_amount shu yig'indining keshi.
 * Yozuvchi ustunlari bo'lsa yangi qatorga yoziladi. Eski qator yangilanmaydi.
 */
const { creatorParams } = require('./yuk-creator');

const CREATOR_COLS = [
  'created_by_telegram_id',
  'created_by_first_name',
  'created_by_last_name',
  'created_by_username',
];

const creatorColumnsReady = { waybills: false, payments: false };
let yukUnitColumn = false;

const { withCreatorName } = require('./yuk-creator');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
}

const COMPANY_KEYS = [
  'company_name',
  'company_phone',
  'company_card',
  'company_card_holder',
  'customer_phone',
];

async function creatorColumns(q, table) {
  if (creatorColumnsReady[table]) return true;
  const found = await q.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
       AND column_name = ANY($2::text[])`,
    [table, CREATOR_COLS]
  );
  const names = found.rows.map(function (row) { return row.column_name; });
  const ok = CREATOR_COLS.every(function (col) { return names.indexOf(col) !== -1; });
  if (ok) creatorColumnsReady[table] = true;
  return ok;
}

function methods(q) {
  async function attachItems(rows) {
    if (!rows.length) return [];
    const ids = rows.map(function (w) { return w.id; });
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
    return rows.map(function (w) {
      w.items = by[String(w.id)] || [];
      w.paid_amount = n(w.paid_amount);
      w.debt_amount = n(w.debt_amount);
      w.total_amount = n(w.total_amount);
      w.paid_cash = n(w.paid_cash);
      w.paid_card = n(w.paid_card);
      return withCreatorName(w);
    });
  }

  const moneySelect =
    `w.*, c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
      COALESCE((
        SELECT SUM(a.amount) FROM payment_allocations a
        JOIN payments p ON p.id = a.payment_id
        WHERE a.waybill_id = w.id AND p.method = 'cash'
          AND p.kind IN ('collection', 'reversal', 'backfill')
      ), 0) AS paid_cash,
      COALESCE((
        SELECT SUM(a.amount) FROM payment_allocations a
        JOIN payments p ON p.id = a.payment_id
        WHERE a.waybill_id = w.id AND p.method = 'card'
          AND p.kind IN ('collection', 'reversal', 'backfill')
      ), 0) AS paid_card`;

  return {
    async lockOwnerCustomer(customerId) {
      const r = await q.query(
        `SELECT * FROM customers WHERE id = $1 AND agent_id IS NULL FOR UPDATE`,
        [customerId]
      );
      return r.rows[0] || null;
    },

    async listOwnerCustomers(query) {
      const params = [];
      let where = 'WHERE c.agent_id IS NULL AND c.is_active = true';
      const text = query && String(query).trim();
      if (text) {
        params.push('%' + text.replace(/[%_]/g, '') + '%');
        where +=
          ' AND (c.name ILIKE $1 OR COALESCE(c.phone, \'\') ILIKE $1 OR COALESCE(c.address, \'\') ILIKE $1)';
      }
      const r = await q.query(
        `SELECT c.id, c.name, c.phone, c.address, c.latitude, c.longitude, c.is_active,
            c.legacy_source,
            COALESCE((
              SELECT SUM(w.debt_amount) FROM waybills w
              WHERE w.customer_id = c.id AND w.agent_id IS NULL
            ), 0) AS debt_amount,
            COALESCE((
              SELECT SUM(s.amount) FROM store_credits s WHERE s.customer_id = c.id
            ), 0) AS store_credit,
            (
              SELECT MAX(w.sale_date) FROM waybills w
              WHERE w.customer_id = c.id AND w.agent_id IS NULL
            ) AS last_sale_date
         FROM customers c
         ${where}
         ORDER BY c.name, c.id
         LIMIT 300`,
        params
      );
      return r.rows.map(function (row) {
        row.debt_amount = n(row.debt_amount);
        row.store_credit = n(row.store_credit);
        row.outstanding = Math.max(0, row.debt_amount - row.store_credit);
        row.last_sale_date = row.last_sale_date ? String(row.last_sale_date).slice(0, 10) : null;
        return row;
      });
    },

    async updateOwnerCustomer(customerId, fields) {
      const r = await q.query(
        `UPDATE customers
           SET name = $1, phone = $2, address = $3, latitude = $4, longitude = $5
         WHERE id = $6 AND agent_id IS NULL AND is_active = true
         RETURNING *`,
        [
          fields.name,
          fields.phone || null,
          fields.address || null,
          fields.latitude != null ? fields.latitude : null,
          fields.longitude != null ? fields.longitude : null,
          customerId,
        ]
      );
      return r.rows[0] || null;
    },

    async insertOwnerCustomer(fields) {
      const r = await q.query(
        `INSERT INTO customers
           (name, phone, address, latitude, longitude, note, agent_id, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,true)
         RETURNING *`,
        [
          fields.name,
          fields.phone || null,
          fields.address || null,
          fields.latitude != null ? fields.latitude : null,
          fields.longitude != null ? fields.longitude : null,
          fields.note || 'Yuk xati do\'koni',
        ]
      );
      const row = r.rows[0];
      row.debt_amount = 0;
      row.store_credit = 0;
      row.outstanding = 0;
      return row;
    },

    async findOwnerWaybillByRequestId(requestId) {
      if (!requestId) return null;
      const r = await q.query(
        `SELECT ${moneySelect}
         FROM waybills w
         LEFT JOIN customers c ON c.id = w.customer_id
         WHERE w.request_id = $1 AND w.agent_id IS NULL
         LIMIT 1`,
        [requestId]
      );
      if (!r.rows.length) return null;
      const rows = await attachItems(r.rows);
      return rows[0];
    },

    async nextWaybillCode(saleDate) {
      const r = await q.query(`SELECT nextval('waybill_code_seq') AS n`);
      const n = String(r.rows[0].n).padStart(6, '0');
      const day = String(saleDate || '').replace(/-/g, '');
      return 'YX-' + day + '-' + n;
    },

    async insertOwnerWaybill(input) {
      const d = input.draft;
      const params = [
        input.code,
        input.customerId,
        d.total_amount,
        input.dueDate || null,
        d.total_amount > 0 ? 'open' : 'paid',
        input.note || null,
        input.requestId || null,
        input.stockPosted === true,
        input.reysId != null ? input.reysId : null,
        input.saleDate,
      ];
      let cols = '';
      let vals = '';
      if (input.creator && await creatorColumns(q, 'waybills')) {
        cols = ', created_by_telegram_id, created_by_first_name, created_by_last_name, created_by_username';
        vals = ',$11,$12,$13,$14';
        params.push.apply(params, creatorParams(input.creator));
      }
      const w = await q.query(
        `INSERT INTO waybills
           (waybill_code, agent_id, customer_id, total_amount, paid_amount, debt_amount,
            commission_amount, due_date, status, note, idempotency_key, request_id,
            stock_posted, reys_id, sale_date${cols})
         VALUES ($1,NULL,$2,$3,0,$3,0,$4,$5,$6,$7,$7,$8,$9,$10${vals})
         RETURNING *`,
        params
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
          [waybill.id, it.product_id, it.product_name, it.quantity, it.price, it.subtotal, n(it.commission)]
        );
        items.push(ir.rows[0]);
      }
      waybill.items = items;
      waybill.paid_amount = 0;
      waybill.debt_amount = n(d.total_amount);
      waybill.total_amount = n(d.total_amount);
      return waybill;
    },

    async lockOwnerWaybill(waybillId) {
      const r = await q.query(
        `SELECT * FROM waybills WHERE id = $1 AND agent_id IS NULL FOR UPDATE`,
        [waybillId]
      );
      return r.rows[0] || null;
    },

    async listOpenOwnerWaybills(customerId) {
      const r = await q.query(
        `SELECT id, sale_date, debt_amount, total_amount, paid_amount, due_date, waybill_code
         FROM waybills
         WHERE customer_id = $1 AND agent_id IS NULL AND debt_amount > 0
         ORDER BY sale_date ASC NULLS LAST, id ASC
         FOR UPDATE`,
        [customerId]
      );
      return r.rows.map(function (row) {
        row.debt_amount = n(row.debt_amount);
        row.total_amount = n(row.total_amount);
        row.paid_amount = n(row.paid_amount);
        return row;
      });
    },

    async allocationState(waybillId) {
      const r = await q.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS sum
         FROM payment_allocations WHERE waybill_id = $1`,
        [waybillId]
      );
      return { count: Number(r.rows[0].count) || 0, sum: n(r.rows[0].sum) };
    },

    async setWaybillMoney(waybillId, money) {
      const r = await q.query(
        `UPDATE waybills SET
           total_amount = $2,
           paid_amount = $3,
           debt_amount = $4,
           status = $5,
           due_date = $6,
           sale_date = $7,
           note = $8,
           updated_at = NOW()
         WHERE id = $1 AND agent_id IS NULL
         RETURNING *`,
        [
          waybillId,
          money.total,
          money.paid,
          money.debt,
          money.status,
          money.dueDate,
          money.saleDate,
          money.note,
        ]
      );
      return r.rows[0] || null;
    },

    async replaceOwnerItems(waybillId, items) {
      await q.query('DELETE FROM waybill_items WHERE waybill_id = $1', [waybillId]);
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const ir = await q.query(
          `INSERT INTO waybill_items
             (waybill_id, product_id, product_name, quantity, price, subtotal, commission)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [waybillId, it.product_id, it.product_name, it.quantity, it.price, it.subtotal, n(it.commission)]
        );
        out.push(ir.rows[0]);
      }
      return out;
    },

    async insertLedgerPayment(input) {
      const params = [
        input.customerId,
        input.amount,
        input.method || 'cash',
        input.note || null,
        input.requestId || null,
        input.reversesPaymentId || null,
        input.kind || 'collection',
      ];
      let cols = '';
      let vals = '';
      if (input.creator && await creatorColumns(q, 'payments')) {
        cols = ', created_by_telegram_id, created_by_first_name, created_by_last_name, created_by_username';
        vals = ',$8,$9,$10,$11';
        params.push.apply(params, creatorParams(input.creator));
      }
      const pay = await q.query(
        `INSERT INTO payments
           (order_id, customer_id, amount, method, note, request_id, reverses_payment_id, kind${cols})
         VALUES (NULL,$1,$2,$3,$4,$5,$6,$7${vals})
         RETURNING *`,
        params
      );
      const payment = pay.rows[0];
      payment.allocations = [];
      const allocations = input.allocations || [];
      for (let i = 0; i < allocations.length; i++) {
        const a = allocations[i];
        if (!a || !a.amount) continue;
        const ar = await q.query(
          `INSERT INTO payment_allocations (payment_id, waybill_id, amount)
           VALUES ($1,$2,$3) RETURNING *`,
          [payment.id, a.waybill_id, a.amount]
        );
        payment.allocations.push(ar.rows[0]);
      }
      if (n(input.credit) !== 0) {
        await q.query(
          `INSERT INTO store_credits (customer_id, amount, payment_id, waybill_id, note)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            input.customerId,
            n(input.credit),
            payment.id,
            input.waybillId || null,
            input.creditNote || input.note || null,
          ]
        );
      }
      payment.credit = n(input.credit);
      return withCreatorName(payment);
    },

    async findLedgerPaymentByRequestId(requestId) {
      if (!requestId) return null;
      const r = await q.query(
        `SELECT p.* FROM payments p
         WHERE p.request_id = $1
           AND (
             EXISTS (
               SELECT 1 FROM payment_allocations a
               JOIN waybills w ON w.id = a.waybill_id
               WHERE a.payment_id = p.id AND w.agent_id IS NULL
             )
             OR EXISTS (SELECT 1 FROM store_credits s WHERE s.payment_id = p.id)
           )
         LIMIT 1`,
        [requestId]
      );
      return r.rows[0] ? withCreatorName(r.rows[0]) : null;
    },

    async getLedgerPayment(paymentId) {
      const r = await q.query(
        `SELECT p.*,
            EXISTS (SELECT 1 FROM payments r WHERE r.reverses_payment_id = p.id) AS reversed
         FROM payments p
         WHERE p.id = $1
           AND p.order_id IS NULL
           AND (
             EXISTS (
               SELECT 1 FROM payment_allocations a
               JOIN waybills w ON w.id = a.waybill_id
               WHERE a.payment_id = p.id AND w.agent_id IS NULL
             )
             OR EXISTS (SELECT 1 FROM store_credits s WHERE s.payment_id = p.id)
           )`,
        [paymentId]
      );
      if (!r.rows.length) return null;
      const payment = r.rows[0];
      const alloc = await q.query(
        `SELECT a.* FROM payment_allocations a
         JOIN waybills w ON w.id = a.waybill_id
         WHERE a.payment_id = $1 AND w.agent_id IS NULL
         ORDER BY a.id`,
        [paymentId]
      );
      payment.allocations = alloc.rows;
      const credit = await q.query(
        `SELECT COALESCE(SUM(amount),0) AS amount FROM store_credits WHERE payment_id = $1`,
        [paymentId]
      );
      payment.credit = n(credit.rows[0].amount);
      payment.amount = n(payment.amount);
      return withCreatorName(payment);
    },

    async getOwnerWaybill(waybillId) {
      const r = await q.query(
        `SELECT ${moneySelect}
         FROM waybills w
         LEFT JOIN customers c ON c.id = w.customer_id
         WHERE w.id = $1 AND w.agent_id IS NULL`,
        [waybillId]
      );
      if (!r.rows.length) return null;
      const rows = await attachItems(r.rows);
      return rows[0];
    },

    async listOwnerWaybills(customerId) {
      const r = await q.query(
        `SELECT ${moneySelect}
         FROM waybills w
         LEFT JOIN customers c ON c.id = w.customer_id
         WHERE w.customer_id = $1 AND w.agent_id IS NULL
         ORDER BY w.sale_date DESC NULLS LAST, w.id DESC
         LIMIT 200`,
        [customerId]
      );
      return attachItems(r.rows);
    },

    async listOwnerPayments(customerId) {
      const r = await q.query(
        `SELECT p.*,
            EXISTS (SELECT 1 FROM payments r WHERE r.reverses_payment_id = p.id) AS reversed
         FROM payments p
         WHERE p.customer_id = $1
           AND p.order_id IS NULL
           AND (
             EXISTS (
               SELECT 1 FROM payment_allocations a
               JOIN waybills w ON w.id = a.waybill_id
               WHERE a.payment_id = p.id AND w.customer_id = $1 AND w.agent_id IS NULL
             )
             OR EXISTS (SELECT 1 FROM store_credits s WHERE s.payment_id = p.id AND s.customer_id = $1)
           )
         ORDER BY p.id DESC
         LIMIT 200`,
        [customerId]
      );
      return r.rows.map(function (row) {
        row.amount = n(row.amount);
        return withCreatorName(row);
      });
    },

    async legacyDebtPayments(customerId) {
      const r = await q.query(
        `SELECT id, amount, notes, created_at, legacy_source, legacy_id
         FROM agent_debt_payments
         WHERE customer_id = $1 AND agent_id IS NULL
         ORDER BY id DESC
         LIMIT 200`,
        [customerId]
      );
      return r.rows.map(function (row) {
        row.amount = n(row.amount);
        row.kind = 'legacy';
        row.method = 'cash';
        return row;
      });
    },

    async listReminderWaybills(tomorrow) {
      const r = await q.query(
        `SELECT w.id, w.waybill_code, w.customer_id, c.name AS customer_name,
                w.debt_amount, w.due_date, w.sale_date, w.total_amount, w.legacy_source, w.stock_posted,
                w.created_by_telegram_id, w.created_by_first_name, w.created_by_last_name, w.created_by_username
         FROM waybills w
         JOIN customers c ON c.id = w.customer_id
         WHERE w.agent_id IS NULL
           AND w.debt_amount > 0
           AND w.due_date IS NOT NULL
           AND w.due_date <= $1::date
         ORDER BY w.due_date ASC, w.id ASC
         LIMIT 300`,
        [tomorrow]
      );
      return r.rows.map(function (row) {
        row.debt_amount = n(row.debt_amount);
        row.total_amount = n(row.total_amount);
        return withCreatorName(row);
      });
    },

    async getCompanySettings() {
      const r = await q.query(
        `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
        [COMPANY_KEYS]
      );
      const map = {};
      r.rows.forEach(function (row) { map[row.key] = row.value || ''; });
      return {
        name: map.company_name || '',
        phone: map.company_phone || map.customer_phone || '',
        card: map.company_card || '',
        card_holder: map.company_card_holder || '',
      };
    },

    async storeCreditBalance(customerId) {
      const r = await q.query(
        `SELECT COALESCE(SUM(amount),0) AS amount FROM store_credits WHERE customer_id = $1`,
        [customerId]
      );
      return n(r.rows[0].amount);
    },

    async ownerCustomerSummary(customerId) {
      const debt = await q.query(
        `SELECT COALESCE(SUM(debt_amount),0) AS amount
         FROM waybills WHERE customer_id = $1 AND agent_id IS NULL`,
        [customerId]
      );
      const credit = await q.query(
        `SELECT COALESCE(SUM(amount),0) AS amount FROM store_credits WHERE customer_id = $1`,
        [customerId]
      );
      return { debt: n(debt.rows[0].amount), credit: n(credit.rows[0].amount) };
    },

    async hasYukUnitColumn() {
      if (yukUnitColumn) return true;
      const found = await q.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'products'
           AND column_name = 'yuk_unit_commission'`
      );
      if (found.rows.length) yukUnitColumn = true;
      return yukUnitColumn;
    },

    async listYukProducts() {
      const has = await this.hasYukUnitColumn();
      const r = await q.query(
        has
          ? `SELECT id, sku, weight_kg, price, yuk_unit_commission
             FROM products WHERE is_active = true ORDER BY id`
          : `SELECT id, sku, weight_kg, price, NULL::integer AS yuk_unit_commission
             FROM products WHERE is_active = true ORDER BY id`
      );
      return r.rows;
    },

    async yukUnitRates(ids) {
      const want = (ids || []).map(function (id) { return Number(id); }).filter(function (id) {
        return Number.isFinite(id);
      });
      if (!want.length || !(await this.hasYukUnitColumn())) return {};
      const r = await q.query(
        `SELECT id, yuk_unit_commission FROM products WHERE id = ANY($1::int[])`,
        [want]
      );
      const map = {};
      r.rows.forEach(function (row) { map[String(row.id)] = n(row.yuk_unit_commission); });
      return map;
    },

    async updateYukProduct(productId, fields) {
      const price = await q.query(
        `UPDATE products SET price = $1
         WHERE id = $2 AND is_active = true
         RETURNING id, sku, price`,
        [fields.price, productId]
      );
      if (!price.rows.length) return null;
      let unit = null;
      if (fields.setUnit) {
        if (!(await this.hasYukUnitColumn())) {
          const err = new Error('migrations/011_yuk_ulush.sql ni qo\'llang');
          err.status = 503;
          throw err;
        }
        const unitRow = await q.query(
          `UPDATE products SET yuk_unit_commission = $1 WHERE id = $2
           RETURNING yuk_unit_commission`,
          [fields.unit_commission, productId]
        );
        unit = n(unitRow.rows[0] && unitRow.rows[0].yuk_unit_commission);
      } else if (await this.hasYukUnitColumn()) {
        const current = await q.query(
          `SELECT yuk_unit_commission FROM products WHERE id = $1`,
          [productId]
        );
        unit = n(current.rows[0] && current.rows[0].yuk_unit_commission);
      }
      return {
        id: price.rows[0].id,
        sku: price.rows[0].sku,
        price: n(price.rows[0].price),
        unit_commission: unit || 0,
      };
    },

    async listOwnerWaybillsOnDate(saleDate) {
      const r = await q.query(
        `SELECT ${moneySelect}
         FROM waybills w
         LEFT JOIN customers c ON c.id = w.customer_id
         WHERE w.agent_id IS NULL AND w.sale_date = $1::date
         ORDER BY c.name, w.id`,
        [saleDate]
      );
      return attachItems(r.rows);
    },

    async listOwnerUlushWaybills() {
      const r = await q.query(
        `SELECT w.id, w.waybill_code, w.customer_id, c.name AS customer_name,
                w.sale_date, w.total_amount, w.paid_amount, w.debt_amount,
                COALESCE((SELECT SUM(i.commission) FROM waybill_items i WHERE i.waybill_id = w.id), 0) AS potential
         FROM waybills w
         LEFT JOIN customers c ON c.id = w.customer_id
         WHERE w.agent_id IS NULL
         ORDER BY w.sale_date, w.id`
      );
      return r.rows.map(function (row) {
        row.total_amount = n(row.total_amount);
        row.paid_amount = n(row.paid_amount);
        row.debt_amount = n(row.debt_amount);
        row.potential = n(row.potential);
        row.sale_date = row.sale_date ? String(row.sale_date).slice(0, 10) : null;
        return row;
      });
    },

    async listOwnerUlushAllocations() {
      const r = await q.query(
        `SELECT a.id, a.waybill_id, a.amount, p.created_at, p.kind, p.id AS payment_id
         FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id
         JOIN waybills w ON w.id = a.waybill_id
         WHERE w.agent_id IS NULL
           AND p.kind IN ('collection', 'reversal', 'backfill', 'reallocation')
         ORDER BY p.id, a.id`
      );
      return r.rows.map(function (row) {
        row.amount = n(row.amount);
        return row;
      });
    },

    async listYukWithdrawals() {
      const r = await q.query(
        `SELECT id, amount, note, taken_on, created_at,
                created_by_telegram_id, created_by_username, created_by_first_name, created_by_role
         FROM yuk_commission_withdrawals
         ORDER BY id DESC
         LIMIT 200`
      );
      return r.rows.map(function (row) {
        row.amount = n(row.amount);
        row.taken_on = row.taken_on ? String(row.taken_on).slice(0, 10) : null;
        return row;
      });
    },

    async insertYukWithdrawal(input) {
      const r = await q.query(
        `INSERT INTO yuk_commission_withdrawals
           (amount, note, taken_on, created_by_telegram_id, created_by_username,
            created_by_first_name, created_by_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          n(input.amount),
          input.note || null,
          input.takenOn,
          input.telegramId || null,
          input.username || null,
          input.firstName || null,
          input.role || null,
        ]
      );
      const row = r.rows[0];
      row.amount = n(row.amount);
      row.taken_on = row.taken_on ? String(row.taken_on).slice(0, 10) : null;
      return row;
    },

    async ensureSetting(key, value, description) {
      await q.query(
        `INSERT INTO settings (key, value, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, value, description || null]
      );
      const r = await q.query(`SELECT value FROM settings WHERE key = $1`, [key]);
      return r.rows[0] ? r.rows[0].value : value;
    },
  };
}

module.exports = { methods: methods };
