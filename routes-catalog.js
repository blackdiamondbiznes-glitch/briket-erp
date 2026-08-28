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
    const { sku, weight_kg, price, description, image_urls, note, is_active } = req.body;
    if (!sku || !String(sku).trim()) return res.status(400).json({ ok: false, error: 'sku majburiy' });
    const r = await pool.query(
      `INSERT INTO products (sku, weight_kg, price, description, image_urls, note, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [String(sku).trim(), num(weight_kg), num(price), description || null, Array.isArray(image_urls) ? image_urls : [], note || null, is_active === false || is_active === 0 ? false : true]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'SKU mavjud' });
    sendError(res, err);
  }
});
app.put('/api/products/:id', async (req, res) => {
  try {
    const { sku, weight_kg, price, description, image_urls, note, is_active } = req.body;
    const r = await pool.query(
      `UPDATE products SET sku = COALESCE($1, sku), weight_kg = COALESCE($2, weight_kg), price = COALESCE($3, price), description = COALESCE($4, description), image_urls = COALESCE($5, image_urls), note = COALESCE($6, note), is_active = COALESCE($7, is_active) WHERE id = $8 RETURNING *`,
      [sku != null ? String(sku).trim() : null, weight_kg != null ? num(weight_kg) : null, price != null ? num(price) : null, description !== undefined ? description : null, image_urls !== undefined ? (Array.isArray(image_urls) ? image_urls : []) : null, note !== undefined ? note : null, is_active !== undefined ? !!is_active : null, req.params.id]
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
