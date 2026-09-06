module.exports = function(app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;
app.get('/api/products', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive ? 'SELECT * FROM products WHERE is_active = true ORDER BY id' : 'SELECT * FROM products ORDER BY id';
    const r = await pool.query(sql);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});
app.get('/api/products/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});
app.post('/api/products', async (req, res) => {
  try {
    const { sku, weight_kg, price, cost_price, description, image_urls, note, is_active } = req.body;
    if (!sku || !String(sku).trim()) return res.status(400).json({ ok: false, error: 'sku majburiy' });
    const r = await pool.query(
      `INSERT INTO products (sku, weight_kg, price, cost_price, description, image_urls, note, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [String(sku).trim(), num(weight_kg), num(price), num(cost_price), description || null, Array.isArray(image_urls) ? image_urls : [], note || null, is_active === false || is_active === 0 ? false : true]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'SKU mavjud' });
    sendError(res, err);
  }
});
app.put('/api/products/:id', async (req, res) => {
  try {
    const { sku, weight_kg, price, cost_price, description, image_urls, note, is_active } = req.body;
    const r = await pool.query(
      `UPDATE products SET sku = COALESCE($1, sku), weight_kg = COALESCE($2, weight_kg), price = COALESCE($3, price), cost_price = COALESCE($4, cost_price), description = COALESCE($5, description), image_urls = COALESCE($6, image_urls), note = COALESCE($7, note), is_active = COALESCE($8, is_active) WHERE id = $9 RETURNING *`,
      [sku != null ? String(sku).trim() : null, weight_kg != null ? num(weight_kg) : null, price != null ? num(price) : null, cost_price != null ? num(cost_price) : null, description !== undefined ? description : null, image_urls !== undefined ? (Array.isArray(image_urls) ? image_urls : []) : null, note !== undefined ? note : null, is_active !== undefined ? !!is_active : null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'SKU mavjud' });
    sendError(res, err);
  }
});
app.delete('/api/products/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1' || req.query.hard === 'true';
    const r = hard ? await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]) : await pool.query('UPDATE products SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    res.json({ ok: true, data: r.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) { sendError(res, err); }
});
app.get('/api/products/:id/recipes', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.product_id, r.material_id, r.qty, r.line_amount,
              m.name AS material_name, m.unit, m.price AS material_price
       FROM recipes r JOIN materials m ON m.id = r.material_id
       WHERE r.product_id = $1 ORDER BY r.id`,
      [req.params.id]
    );
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});
app.put('/api/products/:id/recipes', async (req, res) => {
  const client = await pool.connect();
  try {
    const prod = await client.query('SELECT id FROM products WHERE id = $1', [req.params.id]);
    if (!prod.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    const lines = Array.isArray(req.body.lines) ? req.body.lines : (Array.isArray(req.body) ? req.body : []);
    const seen = {};
    const clean = [];
    for (let i = 0; i < lines.length; i++) {
      const mid = Number(lines[i].material_id);
      if (!mid) continue;
      if (seen[mid]) return res.status(400).json({ ok: false, error: 'Bir material ikki marta' });
      seen[mid] = true;
      const qty = num(lines[i].qty);
      let amt = lines[i].line_amount;
      amt = amt === '' || amt == null ? null : Math.round(num(amt));
      clean.push({ material_id: mid, qty: qty, line_amount: amt });
    }
    await client.query('BEGIN');
    await client.query('DELETE FROM recipes WHERE product_id = $1', [req.params.id]);
    for (let i = 0; i < clean.length; i++) {
      await client.query(
        `INSERT INTO recipes (product_id, material_id, qty, line_amount) VALUES ($1,$2,$3,$4)`,
        [req.params.id, clean[i].material_id, clean[i].qty, clean[i].line_amount]
      );
    }
    await client.query('COMMIT');
    const r = await pool.query(
      `SELECT r.id, r.product_id, r.material_id, r.qty, r.line_amount,
              m.name AS material_name, m.unit, m.price AS material_price
       FROM recipes r JOIN materials m ON m.id = r.material_id
       WHERE r.product_id = $1 ORDER BY r.id`,
      [req.params.id]
    );
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    sendError(res, err);
  } finally { client.release(); }
});
app.get('/api/materials', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive ? 'SELECT * FROM materials WHERE is_active = true ORDER BY id' : 'SELECT * FROM materials ORDER BY id';
    const r = await pool.query(sql);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});
app.get('/api/materials/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM materials WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});
app.post('/api/materials', async (req, res) => {
  try {
    const { name, unit, price, initial_stock, note, is_active } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'name majburiy' });
    const r = await pool.query(
      `INSERT INTO materials (name, unit, price, initial_stock, note, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [String(name).trim(), unit || 'kg', num(price), num(initial_stock), note || null, is_active === false || is_active === 0 ? false : true]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Material mavjud' });
    sendError(res, err);
  }
});
app.put('/api/materials/:id', async (req, res) => {
  try {
    const { name, unit, price, initial_stock, note, is_active } = req.body;
    const r = await pool.query(
      `UPDATE materials SET name = COALESCE($1, name), unit = COALESCE($2, unit), price = COALESCE($3, price), initial_stock = COALESCE($4, initial_stock), note = COALESCE($5, note), is_active = COALESCE($6, is_active) WHERE id = $7 RETURNING *`,
      [name != null ? String(name).trim() : null, unit != null ? unit : null, price != null ? num(price) : null, initial_stock != null ? num(initial_stock) : null, note !== undefined ? note : null, is_active !== undefined ? !!is_active : null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Material mavjud' });
    sendError(res, err);
  }
});
app.delete('/api/materials/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1' || req.query.hard === 'true';
    const r = hard ? await pool.query('DELETE FROM materials WHERE id = $1 RETURNING *', [req.params.id]) : await pool.query('UPDATE materials SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    res.json({ ok: true, data: r.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) { sendError(res, err); }
});
};
