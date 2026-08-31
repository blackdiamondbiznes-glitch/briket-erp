module.exports = function(app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;

  // Zaxiraga ta'sir qiladigan / tasdiqlangan holatlar
  const SOLD_STATUSES = ['confirmed', 'paid', 'partial', 'closed'];
  const ALLOWED_STATUSES = ['pending', 'confirmed', 'paid', 'partial', 'closed', 'cancelled', 'rejected'];

  /** Mijozning joriy tasdiqlangan qarzi */
  async function getCustomerConfirmedDebt(client, customerId) {
    if (!customerId) return 0;
    const r = await client.query(
      `SELECT COALESCE(SUM(debt_amount), 0) AS total FROM orders
       WHERE customer_id = $1
         AND debt_amount > 0
         AND status = ANY($2::text[])`,
      [customerId, SOLD_STATUSES]
    );
    return num(r.rows[0].total);
  }

  app.get('/api/orders', async (req, res) => {
    try {
      const limit = Math.min(num(req.query.limit, 30), 100);
      const status = req.query.status;
      let sql = 'SELECT * FROM orders';
      const params = [];
      if (status) { sql += ' WHERE status = $1'; params.push(status); }
      sql += ' ORDER BY id DESC LIMIT $' + (params.length + 1);
      params.push(limit);
      const orders = await pool.query(sql, params);
      const ids = orders.rows.map((o) => o.id);
      let itemsByOrder = {};
      if (ids.length) {
        const items = await pool.query(
          'SELECT * FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id',
          [ids]
        );
        items.rows.forEach((it) => {
          if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
          itemsByOrder[it.order_id].push(it);
        });
      }
      const data = orders.rows.map((o) => ({ ...o, items: itemsByOrder[o.id] || [] }));
      res.json({ ok: true, count: data.length, data });
    } catch (err) { sendError(res, err); }
  });

  app.get('/api/orders/:id', async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Buyurtma topilmadi' });
      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [req.params.id]);
      res.json({ ok: true, data: { ...r.rows[0], items: items.rows } });
    } catch (err) { sendError(res, err); }
  });

  app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();
    try {
      const { customer_id, customer_name, phone, items, paid_amount, note, source, debt_due } = req.body;
      if (!items || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ ok: false, error: 'items bosh bolmasin' });
      }
      let name = customer_name || '';
      let custId = customer_id || null;
      let creditLimit = 0;
      if (custId) {
        const c = await client.query('SELECT * FROM customers WHERE id = $1', [custId]);
        if (c.rows.length) {
          name = name || c.rows[0].name;
          creditLimit = num(c.rows[0].credit_limit);
        }
      }
      if (!name) {
        return res.status(400).json({ ok: false, error: 'customer_name yoki customer_id kerak' });
      }

      let total = 0;
      const lines = [];
      for (const it of items) {
        let sku = it.sku, productId = it.product_id || null, unitPrice = num(it.unit_price);
        const q = num(it.qty);
        if (q <= 0) continue;
        if (productId) {
          const p = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
          if (p.rows.length) {
            sku = sku || p.rows[0].sku;
            if (unitPrice <= 0) unitPrice = num(p.rows[0].price);
          }
        }
        if (!sku) continue;
        const lineTotal = Math.round(unitPrice * q);
        total += lineTotal;
        lines.push({ product_id: productId, sku, qty: q, unit_price: unitPrice, line_total: lineTotal });
      }
      if (!lines.length) return res.status(400).json({ ok: false, error: 'Yaroqli item yoq' });

      const paid = Math.max(0, num(paid_amount));
      const debt = Math.max(0, total - paid);

      if (custId && debt > 0 && creditLimit > 0) {
        const existingDebt = await getCustomerConfirmedDebt(client, custId);
        if (existingDebt + debt > creditLimit) {
          return res.status(400).json({
            ok: false,
            error: 'Nasiya limiti oshib ketdi. Limit: ' +
              Math.round(creditLimit).toLocaleString('uz-UZ') +
              ' so\'m, mavjud qarz: ' +
              Math.round(existingDebt).toLocaleString('uz-UZ') +
              ' so\'m, yangi qarz: ' +
              Math.round(debt).toLocaleString('uz-UZ') + ' so\'m',
          });
        }
      }

      let status = 'pending';
      if (debt === 0) status = 'paid';
      else if (paid > 0) status = 'partial';

      const code = 'ORD-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
      await client.query('BEGIN');
      const ord = await client.query(
        `INSERT INTO orders (order_code, customer_id, customer_name, phone, status, total_amount, paid_amount, debt_amount, debt_due, source, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [code, custId, name, phone || null, status, total, paid, debt, debt_due || null, source || 'admin', note || null]
      );
      for (const line of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, sku, qty, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [ord.rows[0].id, line.product_id, line.sku, line.qty, line.unit_price, line.line_total]
        );
      }
      if (paid > 0) {
        await client.query(
          `INSERT INTO payments (order_id, customer_id, amount, method, note)
           VALUES ($1,$2,$3,'cash','Boshlangich tolov')`,
          [ord.rows[0].id, custId, paid]
        );
      }
      await client.query('COMMIT');
      const itemsOut = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [ord.rows[0].id]);
      res.status(201).json({ ok: true, data: { ...ord.rows[0], items: itemsOut.rows } });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (e) {}
      sendError(res, err);
    } finally { client.release(); }
  });

  app.patch('/api/orders/:id/status', async (req, res) => {
    try {
      const { status, admin_note } = req.body;
      if (!status) return res.status(400).json({ ok: false, error: 'status majburiy' });
      const next = String(status).toLowerCase().trim();
      if (!ALLOWED_STATUSES.includes(next)) {
        return res.status(400).json({
          ok: false,
          error: 'Noto\'g\'ri status. Ruxsat: ' + ALLOWED_STATUSES.join(', '),
        });
      }

      const cur = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ ok: false, error: 'Buyurtma topilmadi' });
      const prev = String(cur.rows[0].status || '');

      if ((prev === 'cancelled' || prev === 'rejected') && SOLD_STATUSES.includes(next)) {
        return res.status(400).json({
          ok: false,
          error: 'Bekor yoki rad etilgan buyurtmani tasdiqlab bo\'lmaydi',
        });
      }

      const r = await pool.query(
        `UPDATE orders SET status = $1, admin_note = COALESCE($2, admin_note)
         WHERE id = $3 RETURNING *`,
        [next, admin_note !== undefined ? admin_note : null, req.params.id]
      );
      res.json({ ok: true, data: r.rows[0] });
    } catch (err) { sendError(res, err); }
  });

app.get('/api/payments', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(`SELECT p.*, c.name AS customer_name, o.order_code FROM payments p LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN orders o ON o.id = p.order_id ORDER BY p.id DESC LIMIT $1`, [limit]);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/payments', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, order_id, amount, method, note } = req.body;
    const sum = num(amount);
    if (sum <= 0) return res.status(400).json({ ok: false, error: 'amount musbat bolsin' });
    if (!customer_id && !order_id) return res.status(400).json({ ok: false, error: 'customer_id yoki order_id kerak' });
    await client.query('BEGIN');
    let remaining = sum, custId = customer_id || null;
    if (order_id) {
      const o = await client.query('SELECT * FROM orders WHERE id = $1', [order_id]);
      if (o.rows.length && num(o.rows[0].debt_amount) > 0) {
        const pay = Math.min(num(o.rows[0].debt_amount), remaining);
        const newDebt = num(o.rows[0].debt_amount) - pay, newPaid = num(o.rows[0].paid_amount) + pay;
        const st = newDebt === 0 ? 'paid' : 'partial';
        await client.query(`UPDATE orders SET paid_amount = $1, debt_amount = $2, status = $3 WHERE id = $4`, [newPaid, newDebt, st, order_id]);
        remaining -= pay;
        custId = custId || o.rows[0].customer_id;
      }
    } else if (custId) {
      const debts = await client.query(
        `SELECT * FROM orders
         WHERE customer_id = $1 AND debt_amount > 0
           AND status = ANY($2::text[])
         ORDER BY ordered_at ASC`,
        [custId, SOLD_STATUSES]
      );
      for (const o of debts.rows) {
        if (remaining <= 0) break;
        const pay = Math.min(num(o.debt_amount), remaining);
        const newDebt = num(o.debt_amount) - pay;
        const newPaid = num(o.paid_amount) + pay;
        const st = newDebt === 0 ? 'paid' : 'partial';
        await client.query(
          `UPDATE orders SET paid_amount = $1, debt_amount = $2, status = $3 WHERE id = $4`,
          [newPaid, newDebt, st, o.id]
        );
        remaining -= pay;
      }
    }
    const payIns = await client.query(`INSERT INTO payments (order_id, customer_id, amount, method, note) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [order_id || null, custId, sum, method || 'cash', note || null]);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, data: payIns.rows[0], applied: sum - remaining, leftover: remaining });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    sendError(res, err);
  } finally { client.release(); }
});

app.get('/api/expenses', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(`SELECT e.*, b.batch_code FROM expenses e LEFT JOIN batches b ON b.id = e.batch_id ORDER BY e.id DESC LIMIT $1`, [limit]);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, payment_method, batch_id, note, expense_date } = req.body;
    if (!category || num(amount) <= 0) return res.status(400).json({ ok: false, error: 'category va amount majburiy' });
    const r = await pool.query(`INSERT INTO expenses (category, amount, payment_method, batch_id, note, expense_date) VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, NOW())) RETURNING *`, [String(category).trim(), num(amount), payment_method || 'cash', batch_id || null, note || null, expense_date || null]);
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});
};
