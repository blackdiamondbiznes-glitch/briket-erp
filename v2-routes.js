/**
 * Black Diamond ERP v2 routes: settings, pricing, partners, shipments
 * server.js: require('./v2-routes')(app, pool, { num, sendError });
 */
module.exports = function registerV2Routes(app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;

// ========== SETTINGS ==========
app.get('/api/settings', async (req, res) => {
  try {
    const r = await pool.query('SELECT key, value, description, updated_at FROM settings ORDER BY key');
    const map = {};
    r.rows.forEach((row) => { map[row.key] = row.value; });
    res.json({ ok: true, data: map, list: r.rows });
  } catch (err) { sendError(res, err); }
});

app.put('/api/settings/:key', async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    const value = req.body.value != null ? String(req.body.value) : null;
    if (!key || value === null) {
      return res.status(400).json({ ok: false, error: 'key va value majburiy' });
    }
    const r = await pool.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [key, value]
    );
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.put('/api/settings', async (req, res) => {
  try {
    const body = req.body || {};
    const keys = Object.keys(body);
    if (!keys.length) return res.status(400).json({ ok: false, error: 'Bosh body' });
    const updated = [];
    for (const key of keys) {
      const r = await pool.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING *`,
        [key, String(body[key])]
      );
      updated.push(r.rows[0]);
    }
    res.json({ ok: true, data: updated });
  } catch (err) { sendError(res, err); }
});

async function getSettingsMap() {
  const r = await pool.query('SELECT key, value FROM settings');
  const map = {};
  r.rows.forEach((row) => { map[row.key] = row.value; });
  return map;
}

function calcUnitPrice(partner, product, qty, settings) {
  const listPrice = num(product && product.price);
  const q = num(qty);
  const type = partner && partner.type ? String(partner.type) : 'customer';
  const discType = partner && partner.discount_type ? String(partner.discount_type) : 'none';
  const discVal = num(partner && partner.discount_value);

  if (type === 'dealer' || type === 'agent') {
    if (discType === 'fixed_amount') {
      const unit = Math.max(0, listPrice - discVal);
      return { list_price: listPrice, unit_price: unit, discount: listPrice - unit, rule: 'fixed_amount' };
    }
    if (discType === 'fixed_percent') {
      const unit = Math.max(0, Math.round(listPrice * (1 - discVal / 100)));
      return { list_price: listPrice, unit_price: unit, discount: listPrice - unit, rule: 'fixed_percent' };
    }
    return { list_price: listPrice, unit_price: listPrice, discount: 0, rule: 'none' };
  }

  const bulkMinQty = num(settings && settings.bulk_min_qty, 500);
  const bulkMinKg = num(settings && settings.bulk_min_kg, 1000);
  const bulkDiscount = num(settings && settings.bulk_discount, 3000);
  const weight = num(product && product.weight_kg);
  const totalKg = q * weight;
  const isBulk = q >= bulkMinQty || totalKg >= bulkMinKg;

  if (isBulk && bulkDiscount > 0) {
    const unit = Math.max(0, listPrice - bulkDiscount);
    return { list_price: listPrice, unit_price: unit, discount: bulkDiscount, rule: 'bulk' };
  }
  return { list_price: listPrice, unit_price: listPrice, discount: 0, rule: 'none' };
}

app.post('/api/pricing/calc', async (req, res) => {
  try {
    const { partner_id, partner_type, items } = req.body || {};
    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: 'items majburiy' });
    }
    let partner = null;
    if (partner_id) {
      const pr = await pool.query('SELECT * FROM partners WHERE id = $1', [partner_id]);
      if (pr.rows.length) partner = pr.rows[0];
    }
    if (!partner) {
      partner = { type: partner_type || 'customer', discount_type: 'none', discount_value: 0 };
    }
    const settings = await getSettingsMap();
    const lines = [];
    let jami = 0, jamiChegirma = 0, jamiDona = 0, jamiKg = 0;
    for (const it of items) {
      const q = num(it.qty);
      if (q <= 0) continue;
      let product = null;
      if (it.product_id) {
        const p = await pool.query('SELECT * FROM products WHERE id = $1', [it.product_id]);
        if (p.rows.length) product = p.rows[0];
      }
      if (!product && it.sku) {
        const p = await pool.query('SELECT * FROM products WHERE sku = $1', [String(it.sku).trim()]);
        if (p.rows.length) product = p.rows[0];
      }
      if (!product) continue;
      const priceInfo = calcUnitPrice(partner, product, q, settings);
      const lineTotal = Math.round(priceInfo.unit_price * q);
      const lineDisc = Math.round(priceInfo.discount * q);
      jami += lineTotal; jamiChegirma += lineDisc; jamiDona += q; jamiKg += q * num(product.weight_kg);
      lines.push({
        product_id: product.id, sku: product.sku, qty: q, weight_kg: num(product.weight_kg),
        list_price: priceInfo.list_price, unit_price: priceInfo.unit_price, discount: priceInfo.discount,
        line_total: lineTotal, line_discount: lineDisc, rule: priceInfo.rule
      });
    }
    res.json({ ok: true, data: { partner_type: partner.type, lines, jami, jami_chegirma: jamiChegirma, jami_dona: jamiDona, jami_kg: Math.round(jamiKg * 1000) / 1000 } });
  } catch (err) { sendError(res, err); }
});

app.get('/api/partners', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const type = req.query.type;
    const params = [];
    let sql = 'SELECT p.*, parent.name AS parent_name FROM partners p LEFT JOIN partners parent ON parent.id = p.parent_id WHERE 1=1';
    if (onlyActive) sql += ' AND p.is_active = true';
    if (type) { params.push(type); sql += ' AND p.type = $' + params.length; }
    sql += ' ORDER BY p.type, p.name';
    const r = await pool.query(sql, params);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.get('/api/partners/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT p.*, parent.name AS parent_name FROM partners p LEFT JOIN partners parent ON parent.id = p.parent_id WHERE p.id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Hamkor topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.post('/api/partners', async (req, res) => {
  try {
    const { name, phone, address, type, parent_id, region, district, discount_type, discount_value, credit_limit, telegram_id, note, is_active } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'name majburiy' });
    const t = String(type || 'customer').toLowerCase();
    if (!['customer', 'dealer', 'agent'].includes(t)) return res.status(400).json({ ok: false, error: 'type: customer | dealer | agent' });
    const dt = String(discount_type || 'none').toLowerCase();
    if (!['none', 'bulk', 'fixed_amount', 'fixed_percent'].includes(dt)) return res.status(400).json({ ok: false, error: 'discount_type notogri' });
    const r = await pool.query(
      `INSERT INTO partners (name, phone, address, type, parent_id, region, district, discount_type, discount_value, credit_limit, telegram_id, note, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [String(name).trim(), phone || null, address || null, t, parent_id || null, region || null, district || null, dt, num(discount_value), num(credit_limit), telegram_id || null, note || null, is_active === false || is_active === 0 ? false : true]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.put('/api/partners/:id', async (req, res) => {
  try {
    const { name, phone, address, type, parent_id, region, district, discount_type, discount_value, credit_limit, telegram_id, note, is_active } = req.body;
    const r = await pool.query(
      `UPDATE partners SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address), type = COALESCE($4, type),
         parent_id = COALESCE($5, parent_id), region = COALESCE($6, region), district = COALESCE($7, district), discount_type = COALESCE($8, discount_type),
         discount_value = COALESCE($9, discount_value), credit_limit = COALESCE($10, credit_limit), telegram_id = COALESCE($11, telegram_id),
         note = COALESCE($12, note), is_active = COALESCE($13, is_active) WHERE id = $14 RETURNING *`,
      [name != null ? String(name).trim() : null, phone !== undefined ? phone : null, address !== undefined ? address : null, type != null ? String(type).toLowerCase() : null, parent_id !== undefined ? (parent_id || null) : null, region !== undefined ? region : null, district !== undefined ? district : null, discount_type != null ? String(discount_type).toLowerCase() : null, discount_value != null ? num(discount_value) : null, credit_limit != null ? num(credit_limit) : null, telegram_id !== undefined ? telegram_id : null, note !== undefined ? note : null, is_active !== undefined ? !!is_active : null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Hamkor topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/partners/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1' || req.query.hard === 'true';
    const r = hard ? await pool.query('DELETE FROM partners WHERE id = $1 RETURNING *', [req.params.id]) : await pool.query('UPDATE partners SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Hamkor topilmadi' });
    res.json({ ok: true, data: r.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) { sendError(res, err); }
});

app.get('/api/partners/:id/debt', async (req, res) => {
  try {
    const id = req.params.id;
    const partner = await pool.query('SELECT * FROM partners WHERE id = $1', [id]);
    if (!partner.rows.length) return res.status(404).json({ ok: false, error: 'Hamkor topilmadi' });
    const orderDebt = await pool.query(`SELECT COALESCE(SUM(debt_amount),0) AS total FROM orders WHERE partner_id = $1 AND debt_amount > 0`, [id]);
    const shipped = await pool.query(`SELECT COALESCE(SUM(total_amount),0) AS total, COALESCE(SUM(qty - returned_qty),0) AS qty FROM shipments WHERE to_partner_id = $1 AND status IN ('given','partial_return','closed')`, [id]);
    const paid = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE partner_id = $1`, [id]);
    const orderDebtAmt = num(orderDebt.rows[0].total);
    const shippedAmt = num(shipped.rows[0].total);
    const paidAmt = num(paid.rows[0].total);
    res.json({ ok: true, data: { partner: partner.rows[0], order_debt: orderDebtAmt, shipped_amount: shippedAmt, shipped_qty: num(shipped.rows[0].qty), paid_amount: paidAmt, estimated_balance: orderDebtAmt + shippedAmt - paidAmt } });
  } catch (err) { sendError(res, err); }
});

app.get('/api/shipments', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const toId = req.query.to_partner_id;
    const fromId = req.query.from_partner_id;
    const status = req.query.status;
    const params = [];
    let sql = `SELECT s.*, tp.name AS to_name, tp.type AS to_type, fp.name AS from_name FROM shipments s LEFT JOIN partners tp ON tp.id = s.to_partner_id LEFT JOIN partners fp ON fp.id = s.from_partner_id WHERE 1=1`;
    if (toId) { params.push(toId); sql += ' AND s.to_partner_id = $' + params.length; }
    if (fromId) { params.push(fromId); sql += ' AND s.from_partner_id = $' + params.length; }
    if (status) { params.push(status); sql += ' AND s.status = $' + params.length; }
    params.push(limit);
    sql += ' ORDER BY s.id DESC LIMIT $' + params.length;
    const r = await pool.query(sql, params);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.get('/api/shipments/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT s.*, tp.name AS to_name, tp.type AS to_type, fp.name AS from_name FROM shipments s LEFT JOIN partners tp ON tp.id = s.to_partner_id LEFT JOIN partners fp ON fp.id = s.from_partner_id WHERE s.id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Yuk topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.post('/api/shipments', async (req, res) => {
  try {
    const { from_type, from_partner_id, to_partner_id, product_id, sku, qty, unit_price, note, given_at } = req.body;
    if (!to_partner_id) return res.status(400).json({ ok: false, error: 'to_partner_id majburiy' });
    const q = num(qty);
    if (q <= 0) return res.status(400).json({ ok: false, error: 'qty musbat bolsin' });
    const ft = String(from_type || 'factory').toLowerCase();
    if (!['factory', 'dealer'].includes(ft)) return res.status(400).json({ ok: false, error: 'from_type: factory | dealer' });
    if (ft === 'dealer' && !from_partner_id) return res.status(400).json({ ok: false, error: 'Dilerdan berishda from_partner_id kerak' });
    let product = null;
    if (product_id) {
      const p = await pool.query('SELECT * FROM products WHERE id = $1', [product_id]);
      if (p.rows.length) product = p.rows[0];
    }
    if (!product && sku) {
      const p = await pool.query('SELECT * FROM products WHERE sku = $1', [String(sku).trim()]);
      if (p.rows.length) product = p.rows[0];
    }
    if (!product) return res.status(400).json({ ok: false, error: 'product_id yoki sku topilmadi' });
    const toP = await pool.query('SELECT * FROM partners WHERE id = $1', [to_partner_id]);
    if (!toP.rows.length) return res.status(404).json({ ok: false, error: 'Qabul qiluvchi topilmadi' });
    let price = num(unit_price);
    if (price <= 0) {
      const settings = await getSettingsMap();
      price = calcUnitPrice(toP.rows[0], product, q, settings).unit_price;
    }
    const total = Math.round(price * q);
    const code = 'SH-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + Math.floor(10 + Math.random() * 90);
    const r = await pool.query(
      `INSERT INTO shipments (shipment_code, from_type, from_partner_id, to_partner_id, product_id, sku, qty, unit_price, total_amount, note, given_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11, NOW())) RETURNING *`,
      [code, ft, ft === 'factory' ? null : from_partner_id, to_partner_id, product.id, product.sku, q, price, total, note || null, given_at || null]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Kod takrorlandi' });
    sendError(res, err);
  }
});

app.patch('/api/shipments/:id', async (req, res) => {
  try {
    const { status, returned_qty, note } = req.body;
    const r = await pool.query(
      `UPDATE shipments SET status = COALESCE($1, status), returned_qty = COALESCE($2, returned_qty), note = COALESCE($3, note) WHERE id = $4 RETURNING *`,
      [status || null, returned_qty != null ? num(returned_qty) : null, note !== undefined ? note : null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Yuk topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

};
