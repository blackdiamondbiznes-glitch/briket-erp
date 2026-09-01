module.exports = function(app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;

app.get('/api/batches', async (req, res) => {
  try {
    const status = req.query.status;
    let sql = 'SELECT * FROM batches';
    const params = [];
    if (status) { sql += ' WHERE status = $1'; params.push(status); }
    sql += ' ORDER BY id DESC';
    const r = await pool.query(sql, params);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.get('/api/batches/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Partiya topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.post('/api/batches', async (req, res) => {
  try {
    const {
      bags_count, bag_price, dry_kg, workers_count, press_wage,
      note, already_packed_kg, material_id,
    } = req.body;
    const bags = num(bags_count);
    const price = num(bag_price);
    const dry = num(dry_kg);
    const already = Math.max(0, num(already_packed_kg));
    if (bags <= 0 || price <= 0 || dry <= 0) {
      return res.status(400).json({ ok: false, error: 'bags_count, bag_price, dry_kg musbat bolishi kerak' });
    }
    if (already > dry + 0.01) {
      return res.status(400).json({ ok: false, error: 'already_packed_kg dry_kg dan katta bolmasin' });
    }

    let matRow = null;
    if (material_id) {
      const mat = await pool.query(
        'SELECT id, price, name FROM materials WHERE id = $1 AND is_active = true',
        [material_id]
      );
      if (!mat.rows.length) {
        return res.status(400).json({ ok: false, error: 'Material topilmadi yoki nofaol' });
      }
      matRow = mat.rows[0];
    } else {
      const mat = await pool.query(
        `SELECT id, price, name FROM materials
         WHERE is_active = true
           AND (name ILIKE '%ko''mir%' OR name ILIKE '%komir%' OR name ILIKE '%ko%mir%')
         ORDER BY id ASC LIMIT 1`
      );
      if (mat.rows.length) matRow = mat.rows[0];
    }

    const bagsCost = bags * price;
    const estimated = bags * 27;
    const loss = estimated > 0 ? Number((((estimated - dry) / estimated) * 100).toFixed(1)) : 0;
    const remaining = Math.max(0, Math.round((dry - already) * 1000) / 1000);
    const status = remaining > 0.01 ? 'active' : 'closed';
    const seqR = await pool.query("SELECT nextval(pg_get_serial_sequence('batches','id')) AS seq");
    const code = 'P-' + new Date().toISOString().slice(0, 10) + '-' + String(seqR.rows[0].seq).padStart(4, '0');

    const r = await pool.query(
      `INSERT INTO batches (
         batch_code, status, bags_count, bag_price, bags_cost, estimated_kg,
         dry_kg, loss_percent, packed_kg, remaining_kg, workers_count, press_wage, note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        code, status, bags, price, bagsCost, estimated, dry, loss,
        already, remaining, num(workers_count), num(press_wage), note || null,
      ]
    );

    if (num(press_wage) > 0) {
      await pool.query(
        `INSERT INTO expenses (category, amount, payment_method, batch_id, note)
         VALUES ('Press ish haqi', $1, 'cash', $2, $3)`,
        [num(press_wage), r.rows[0].id, code + ' | ' + num(workers_count) + ' kishi']
      );
    }

    if (matRow) {
      const unitPrice = num(matRow.price) > 0 ? num(matRow.price) : price;
      await pool.query(
        `INSERT INTO material_movements (
           material_id, movement_type, qty, unit_price, total_amount, batch_id, note
         ) VALUES ($1, 'out', $2, $3, $4, $5, $6)`,
        [
          matRow.id, bags, unitPrice, bags * unitPrice, r.rows[0].id,
          'Pressga sarflandi: ' + (matRow.name || ''),
        ]
      );
    }

    res.status(201).json({
      ok: true,
      data: r.rows[0],
      material_used: matRow ? { id: matRow.id, name: matRow.name } : null,
      warning: matRow ? null : 'Material topilmadi — material_movements yozilmadi. material_id yuboring.',
    });
  } catch (err) { sendError(res, err); }
});

app.put('/api/batches/:id', async (req, res) => {
  try {
    const { status, note, packed_kg, remaining_kg } = req.body;
    const r = await pool.query(`UPDATE batches SET status = COALESCE($1, status), note = COALESCE($2, note), packed_kg = COALESCE($3, packed_kg), remaining_kg = COALESCE($4, remaining_kg) WHERE id = $5 RETURNING *`, [status || null, note !== undefined ? note : null, packed_kg != null ? num(packed_kg) : null, remaining_kg != null ? num(remaining_kg) : null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Partiya topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/batches/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ ok: false, error: 'Partiya topilmadi' });
    if (num(check.rows[0].packed_kg) > 0) return res.status(400).json({ ok: false, error: 'Qadoqlangan partiya ochirilmaydi' });
    const r = await pool.query('DELETE FROM batches WHERE id = $1 RETURNING *', [req.params.id]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.get('/api/packaging', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(`SELECT p.*, pr.sku, b.batch_code FROM packaging p LEFT JOIN products pr ON pr.id = p.product_id LEFT JOIN batches b ON b.id = p.batch_id ORDER BY p.id DESC LIMIT $1`, [limit]);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/packaging', async (req, res) => {
  const client = await pool.connect();
  try {
    const { batch_id, product_id, qty, unit_wage, workers_count, sell_price, note } = req.body;
    const dona = num(qty);
    if (dona <= 0) return res.status(400).json({ ok: false, error: 'qty musbat bolsin' });
    if (!product_id) return res.status(400).json({ ok: false, error: 'product_id majburiy' });
    const prod = await client.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (!prod.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    const weight = num(prod.rows[0].weight_kg);
    if (weight <= 0) return res.status(400).json({ ok: false, error: 'Mahsulot ogirligi 0' });
    const totalKg = dona * weight, wage = num(unit_wage, 700), workers = num(workers_count, 1), totalWage = dona * wage;
    const price = num(sell_price) > 0 ? num(sell_price) : num(prod.rows[0].price);
    await client.query('BEGIN');
    let batchId = batch_id ? num(batch_id) : null;
    if (batchId) {
      const b = await client.query('SELECT * FROM batches WHERE id = $1 AND status = $2 FOR UPDATE', [batchId, 'active']);
      if (!b.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'Partiya topilmadi yoki yopilgan' }); }
      if (totalKg > num(b.rows[0].remaining_kg) + 0.5) { await client.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'Partiyada yetarli quruq yoq' }); }
      const newPacked = num(b.rows[0].packed_kg) + totalKg, newRem = Math.max(0, num(b.rows[0].dry_kg) - newPacked);
      await client.query(`UPDATE batches SET packed_kg = $1, remaining_kg = $2, status = CASE WHEN $2 <= 0.01 THEN 'closed' ELSE status END WHERE id = $3`, [newPacked, newRem, batchId]);
    } else {
      const actives = await client.query(`SELECT * FROM batches WHERE status = 'active' AND remaining_kg > 0 ORDER BY created_at ASC FOR UPDATE`);
      let need = totalKg;
      const totalAvail = actives.rows.reduce((s, x) => s + num(x.remaining_kg), 0);
      if (actives.rows.length === 0 || need > totalAvail + 0.5) { await client.query('ROLLBACK'); return res.status(400).json({ ok: false, error: 'Faol partiyada yetarli quruq yoq' }); }
      for (const b of actives.rows) {
        if (need <= 0.01) break;
        const take = Math.min(num(b.remaining_kg), need);
        const newPacked = num(b.packed_kg) + take, newRem = Math.max(0, num(b.dry_kg) - newPacked);
        await client.query(`UPDATE batches SET packed_kg = $1, remaining_kg = $2, status = CASE WHEN $2 <= 0.01 THEN 'closed' ELSE status END WHERE id = $3`, [newPacked, newRem, b.id]);
        if (!batchId) batchId = b.id;
        need -= take;
      }
    }
    const ins = await client.query(`INSERT INTO packaging (batch_id, product_id, qty, kg, unit_wage, workers_count, total_wage, sell_price, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [batchId, product_id, dona, totalKg, wage, workers, totalWage, price, note || null]);
    if (totalWage > 0) await client.query(`INSERT INTO expenses (category, amount, payment_method, batch_id, note) VALUES ('Qadoqlash ish haqi', $1, 'cash', $2, $3)`, [totalWage, batchId, dona + ' dona | ' + workers + ' kishi']);
    await client.query('COMMIT');
    res.status(201).json({ ok: true, data: ins.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    sendError(res, err);
  } finally { client.release(); }
});

app.get('/api/material-movements', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(`SELECT m.*, mat.name AS material_name, mat.unit FROM material_movements m LEFT JOIN materials mat ON mat.id = m.material_id ORDER BY m.id DESC LIMIT $1`, [limit]);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/material-movements', async (req, res) => {
  try {
    const { material_id, movement_type, qty, unit_price, batch_id, note } = req.body;
    const type = String(movement_type || '').toLowerCase();
    if (!['in', 'out'].includes(type)) return res.status(400).json({ ok: false, error: 'movement_type: in yoki out' });
    if (!material_id || num(qty) <= 0) return res.status(400).json({ ok: false, error: 'material_id va qty majburiy' });
    const up = num(unit_price), q = num(qty), total = q * up;
    const r = await pool.query(`INSERT INTO material_movements (material_id, movement_type, qty, unit_price, total_amount, batch_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [material_id, type, q, up, total, batch_id || null, note || null]);
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});
};
