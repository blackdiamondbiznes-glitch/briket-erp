module.exports = function(app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;
// ========== CUSTOMERS ==========
app.get('/api/customers', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive
      ? 'SELECT * FROM customers WHERE is_active = true ORDER BY id'
      : 'SELECT * FROM customers ORDER BY id';
    const r = await pool.query(sql);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mijoz topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { name, phone, address, credit_limit, telegram_id, note, is_active } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'name majburiy' });
    }
    const r = await pool.query(
      `INSERT INTO customers (name, phone, address, credit_limit, telegram_id, note, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        String(name).trim(), phone || null, address || null,
        num(credit_limit), telegram_id || null, note || null,
        is_active === false || is_active === 0 ? false : true
      ]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { name, phone, address, credit_limit, telegram_id, note, is_active } = req.body;
    const r = await pool.query(
      `UPDATE customers SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         address = COALESCE($3, address),
         credit_limit = COALESCE($4, credit_limit),
         telegram_id = COALESCE($5, telegram_id),
         note = COALESCE($6, note),
         is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [
        name != null ? String(name).trim() : null,
        phone !== undefined ? phone : null,
        address !== undefined ? address : null,
        credit_limit != null ? num(credit_limit) : null,
        telegram_id !== undefined ? telegram_id : null,
        note !== undefined ? note : null,
        is_active !== undefined ? !!is_active : null,
        req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mijoz topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1' || req.query.hard === 'true';
    const r = hard
      ? await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id])
      : await pool.query('UPDATE customers SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mijoz topilmadi' });
    res.json({ ok: true, data: r.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) { sendError(res, err); }
});

};
