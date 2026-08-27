require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Admin panel (public/admin.html)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// ========== API HIMOYA (ixtiyoriy) ==========
// Render Environment ga ADMIN_KEY qo'shing. Bo'sh bo'lsa — himoya o'chiq.
function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return next(); // himoya o'chiq
  const given = req.headers['x-admin-key'] || req.query.key;
  if (given === key) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// O'qish ochiq, yozish himoyalangan (ADMIN_KEY bo'lsa)
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  return requireAdmin(req, res, next);
});


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.query('SELECT NOW() AS now')
  .then((res) => console.log('PostgreSQL OK:', res.rows[0].now))
  .catch((err) => console.error('PostgreSQL error:', err.message));

function sendError(res, err, status = 500) {
  console.error(err);
  res.status(status).json({ ok: false, error: err.message || String(err) });
}

function num(v, def = 0) {
  const n = Number(v);
  return isNaN(n) ? def : n;
}

app.get('/', (req, res) => {
  res.json({
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString(),
    version: '1.5.0',
    modules: [
      'products', 'materials', 'customers',
      'batches', 'packaging', 'material-movements',
      'orders', 'payments', 'expenses', 'stock', 'dashboard'
    ]
  });
});

app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS db_time, current_database() AS db_name');
    res.json({
      ok: true,
      server_time: new Date().toISOString(),
      db_time: r.rows[0].db_time,
      database: r.rows[0].db_name
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ========== PRODUCTS ==========
app.get('/api/products', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive
      ? 'SELECT * FROM products WHERE is_active = true ORDER BY id'
      : 'SELECT * FROM products ORDER BY id';
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
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ ok: false, error: 'sku majburiy' });
    }
    const r = await pool.query(
      `INSERT INTO products (sku, weight_kg, price, description, image_urls, note, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        String(sku).trim(), num(weight_kg), num(price),
        description || null,
        Array.isArray(image_urls) ? image_urls : [],
        note || null,
        is_active === false || is_active === 0 ? false : true
      ]
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
      `UPDATE products SET
         sku = COALESCE($1, sku),
         weight_kg = COALESCE($2, weight_kg),
         price = COALESCE($3, price),
         description = COALESCE($4, description),
         image_urls = COALESCE($5, image_urls),
         note = COALESCE($6, note),
         is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [
        sku != null ? String(sku).trim() : null,
        weight_kg != null ? num(weight_kg) : null,
        price != null ? num(price) : null,
        description !== undefined ? description : null,
        image_urls !== undefined ? (Array.isArray(image_urls) ? image_urls : []) : null,
        note !== undefined ? note : null,
        is_active !== undefined ? !!is_active : null,
        req.params.id
      ]
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
    const r = hard
      ? await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id])
      : await pool.query('UPDATE products SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    res.json({ ok: true, data: r.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) { sendError(res, err); }
});

// ========== MATERIALS ==========
app.get('/api/materials', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive
      ? 'SELECT * FROM materials WHERE is_active = true ORDER BY id'
      : 'SELECT * FROM materials ORDER BY id';
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
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'name majburiy' });
    }
    const r = await pool.query(
      `INSERT INTO materials (name, unit, price, initial_stock, note, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        String(name).trim(), unit || 'kg', num(price), num(initial_stock),
        note || null,
        is_active === false || is_active === 0 ? false : true
      ]
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
      `UPDATE materials SET
         name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         price = COALESCE($3, price),
         initial_stock = COALESCE($4, initial_stock),
         note = COALESCE($5, note),
         is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [
        name != null ? String(name).trim() : null,
        unit != null ? unit : null,
        price != null ? num(price) : null,
        initial_stock != null ? num(initial_stock) : null,
        note !== undefined ? note : null,
        is_active !== undefined ? !!is_active : null,
        req.params.id
      ]
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
    const r = hard
      ? await pool.query('DELETE FROM materials WHERE id = $1 RETURNING *', [req.params.id])
      : await pool.query('UPDATE materials SET is_active = false WHERE id = $1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    res.json({ ok: true, data: r.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) { sendError(res, err); }
});

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

// ========== BATCHES ==========
app.get('/api/batches', async (req, res) => {
  try {
    const status = req.query.status;
    let sql = 'SELECT * FROM batches';
    const params = [];
    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }
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
      bags_count, bag_price, dry_kg, workers_count, press_wage, note, already_packed_kg
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

    const bagsCost = bags * price;
    const estimated = bags * 27;
    const loss = estimated > 0 ? Number((((estimated - dry) / estimated) * 100).toFixed(1)) : 0;
    const remaining = Math.max(0, Math.round((dry - already) * 1000) / 1000);
    const status = remaining > 0.01 ? 'active' : 'closed';

    const now = new Date();
    const code = 'P-' + now.toISOString().slice(0, 10) + '-' + Math.floor(10 + Math.random() * 90);

    const r = await pool.query(
      `INSERT INTO batches (
         batch_code, status, bags_count, bag_price, bags_cost,
         estimated_kg, dry_kg, loss_percent, packed_kg, remaining_kg,
         workers_count, press_wage, note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        code, status, bags, price, bagsCost,
        estimated, dry, loss, already, remaining,
        num(workers_count), num(press_wage), note || null
      ]
    );

    if (num(press_wage) > 0) {
      await pool.query(
        `INSERT INTO expenses (category, amount, payment_method, batch_id, note)
         VALUES ('Press ish haqi', $1, 'cash', $2, $3)`,
        [num(press_wage), r.rows[0].id, code + ' | ' + num(workers_count) + ' kishi']
      );
    }

    const mat = await pool.query(
      `SELECT id, price FROM materials WHERE name ILIKE '%ko%mir%' OR name ILIKE '%komir%' LIMIT 1`
    );
    if (mat.rows.length) {
      await pool.query(
        `INSERT INTO material_movements (material_id, movement_type, qty, unit_price, total_amount, batch_id, note)
         VALUES ($1, 'out', $2, $3, $4, $5, $6)`,
        [mat.rows[0].id, bags, price, bagsCost, r.rows[0].id, 'Pressga sarflandi']
      );
    }

    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.put('/api/batches/:id', async (req, res) => {
  try {
    const { status, note, packed_kg, remaining_kg } = req.body;
    const r = await pool.query(
      `UPDATE batches SET
         status = COALESCE($1, status),
         note = COALESCE($2, note),
         packed_kg = COALESCE($3, packed_kg),
         remaining_kg = COALESCE($4, remaining_kg)
       WHERE id = $5 RETURNING *`,
      [
        status || null,
        note !== undefined ? note : null,
        packed_kg != null ? num(packed_kg) : null,
        remaining_kg != null ? num(remaining_kg) : null,
        req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Partiya topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

app.delete('/api/batches/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT * FROM batches WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ ok: false, error: 'Partiya topilmadi' });
    const b = check.rows[0];
    if (num(b.packed_kg) > 1) {
      return res.status(400).json({
        ok: false,
        error: 'Qadoqlangan partiya ochirilmaydi. packed_kg: ' + b.packed_kg
      });
    }
    const r = await pool.query('DELETE FROM batches WHERE id = $1 RETURNING *', [req.params.id]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

// ========== PACKAGING ==========
app.get('/api/packaging', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(
      `SELECT p.*, pr.sku, b.batch_code
       FROM packaging p
       LEFT JOIN products pr ON pr.id = p.product_id
       LEFT JOIN batches b ON b.id = p.batch_id
       ORDER BY p.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/packaging', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      batch_id, product_id, qty, unit_wage, workers_count, sell_price, note
    } = req.body;

    const dona = num(qty);
    if (dona <= 0) return res.status(400).json({ ok: false, error: 'qty musbat bolsin' });
    if (!product_id) return res.status(400).json({ ok: false, error: 'product_id majburiy' });

    const prod = await client.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (!prod.rows.length) return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    const weight = num(prod.rows[0].weight_kg);
    if (weight <= 0) return res.status(400).json({ ok: false, error: 'Mahsulot ogirligi 0' });

    const totalKg = dona * weight;
    const wage = num(unit_wage, 700);
    const workers = num(workers_count, 1);
    const totalWage = dona * wage;
    const price = num(sell_price) > 0 ? num(sell_price) : num(prod.rows[0].price);

    await client.query('BEGIN');

    let batchId = batch_id ? num(batch_id) : null;
    if (batchId) {
      const b = await client.query('SELECT * FROM batches WHERE id = $1 AND status = $2', [batchId, 'active']);
      if (!b.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'Partiya topilmadi yoki yopilgan' });
      }
      if (totalKg > num(b.rows[0].remaining_kg) + 0.5) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: 'Partiyada yetarli quruq yoq. Qolgan: ' + b.rows[0].remaining_kg + ' kg'
        });
      }
      const newPacked = num(b.rows[0].packed_kg) + totalKg;
      const newRem = Math.max(0, num(b.rows[0].dry_kg) - newPacked);
      await client.query(
        `UPDATE batches SET packed_kg = $1, remaining_kg = $2,
           status = CASE WHEN $2 <= 0.01 THEN 'closed' ELSE status END
         WHERE id = $3`,
        [newPacked, newRem, batchId]
      );
    } else {
      const actives = await client.query(
        `SELECT * FROM batches WHERE status = 'active' AND remaining_kg > 0 ORDER BY created_at ASC`
      );
      let need = totalKg;
      const totalAvail = actives.rows.reduce((s, x) => s + num(x.remaining_kg), 0);
      if (actives.rows.length === 0 || need > totalAvail + 0.5) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: 'Faol partiyada yetarli quruq yoq. Mavjud: ' + totalAvail.toFixed(1) + ' kg'
        });
      }
      for (const b of actives.rows) {
        if (need <= 0.01) break;
        const take = Math.min(num(b.remaining_kg), need);
        const newPacked = num(b.packed_kg) + take;
        const newRem = Math.max(0, num(b.dry_kg) - newPacked);
        await client.query(
          `UPDATE batches SET packed_kg = $1, remaining_kg = $2,
             status = CASE WHEN $2 <= 0.01 THEN 'closed' ELSE status END
           WHERE id = $3`,
          [newPacked, newRem, b.id]
        );
        if (!batchId) batchId = b.id;
        need -= take;
      }
    }

    const ins = await client.query(
      `INSERT INTO packaging (
         batch_id, product_id, qty, kg, unit_wage, workers_count, total_wage, sell_price, note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [batchId, product_id, dona, totalKg, wage, workers, totalWage, price, note || null]
    );

    if (totalWage > 0) {
      await client.query(
        `INSERT INTO expenses (category, amount, payment_method, batch_id, note)
         VALUES ('Qadoqlash ish haqi', $1, 'cash', $2, $3)`,
        [totalWage, batchId, dona + ' dona | ' + workers + ' kishi']
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, data: ins.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    sendError(res, err);
  } finally {
    client.release();
  }
});

// ========== MATERIAL MOVEMENTS ==========
app.get('/api/material-movements', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(
      `SELECT m.*, mat.name AS material_name, mat.unit
       FROM material_movements m
       LEFT JOIN materials mat ON mat.id = m.material_id
       ORDER BY m.id DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/material-movements', async (req, res) => {
  try {
    const { material_id, movement_type, qty, unit_price, batch_id, note } = req.body;
    const type = String(movement_type || '').toLowerCase();
    if (!['in', 'out'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'movement_type: in yoki out' });
    }
    if (!material_id || num(qty) <= 0) {
      return res.status(400).json({ ok: false, error: 'material_id va qty majburiy' });
    }
    const up = num(unit_price);
    const q = num(qty);
    const total = q * up;
    const r = await pool.query(
      `INSERT INTO material_movements
         (material_id, movement_type, qty, unit_price, total_amount, batch_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [material_id, type, q, up, total, batch_id || null, note || null]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

// ========== ORDERS ==========
app.get('/api/orders', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 30), 100);
    const status = req.query.status;
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }
    sql += ' ORDER BY id DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    const orders = await pool.query(sql, params);

    const data = [];
    for (const o of orders.rows) {
      const items = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
        [o.id]
      );
      data.push({ ...o, items: items.rows });
    }
    res.json({ ok: true, count: data.length, data });
  } catch (err) { sendError(res, err); }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Buyurtma topilmadi' });
    const items = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
      [req.params.id]
    );
    res.json({ ok: true, data: { ...r.rows[0], items: items.rows } });
  } catch (err) { sendError(res, err); }
});

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      customer_id, customer_name, phone, items, paid_amount, note, source, debt_due
    } = req.body;

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: 'items bosh bolmasin' });
    }

    let name = customer_name || '';
    let custId = customer_id || null;
    if (custId) {
      const c = await client.query('SELECT * FROM customers WHERE id = $1', [custId]);
      if (c.rows.length) name = name || c.rows[0].name;
    }
    if (!name) return res.status(400).json({ ok: false, error: 'customer_name yoki customer_id kerak' });

    let total = 0;
    const lines = [];
    for (const it of items) {
      let sku = it.sku;
      let productId = it.product_id || null;
      let unitPrice = num(it.unit_price);
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
    if (!lines.length) {
      return res.status(400).json({ ok: false, error: 'Yaroqli item yoq' });
    }

    const paid = Math.max(0, num(paid_amount));
    const debt = Math.max(0, total - paid);
    let status = 'pending';
    if (debt === 0) status = 'paid';
    else if (paid > 0) status = 'partial';

    const code = 'ORD-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

    await client.query('BEGIN');

    const ord = await client.query(
      `INSERT INTO orders (
         order_code, customer_id, customer_name, phone, status,
         total_amount, paid_amount, debt_amount, debt_due, source, note
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        code, custId, name, phone || null, status,
        total, paid, debt, debt_due || null,
        source || 'admin', note || null
      ]
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

    const itemsOut = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [ord.rows[0].id]
    );
    res.status(201).json({ ok: true, data: { ...ord.rows[0], items: itemsOut.rows } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    sendError(res, err);
  } finally {
    client.release();
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!status) return res.status(400).json({ ok: false, error: 'status majburiy' });
    const r = await pool.query(
      `UPDATE orders SET status = $1, admin_note = COALESCE($2, admin_note)
       WHERE id = $3 RETURNING *`,
      [status, admin_note !== undefined ? admin_note : null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Buyurtma topilmadi' });
    res.json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});

// ========== PAYMENTS ==========
app.get('/api/payments', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(
      `SELECT p.*, c.name AS customer_name, o.order_code
       FROM payments p
       LEFT JOIN customers c ON c.id = p.customer_id
       LEFT JOIN orders o ON o.id = p.order_id
       ORDER BY p.id DESC LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/payments', async (req, res) => {
  const client = await pool.connect();
  try {
    const { customer_id, order_id, amount, method, note } = req.body;
    const sum = num(amount);
    if (sum <= 0) return res.status(400).json({ ok: false, error: 'amount musbat bolsin' });
    if (!customer_id && !order_id) {
      return res.status(400).json({ ok: false, error: 'customer_id yoki order_id kerak' });
    }

    await client.query('BEGIN');

    let remaining = sum;
    let custId = customer_id || null;

    if (order_id) {
      const o = await client.query('SELECT * FROM orders WHERE id = $1', [order_id]);
      if (o.rows.length && num(o.rows[0].debt_amount) > 0) {
        const pay = Math.min(num(o.rows[0].debt_amount), remaining);
        const newDebt = num(o.rows[0].debt_amount) - pay;
        const newPaid = num(o.rows[0].paid_amount) + pay;
        const st = newDebt === 0 ? 'paid' : 'partial';
        await client.query(
          `UPDATE orders SET paid_amount = $1, debt_amount = $2, status = $3 WHERE id = $4`,
          [newPaid, newDebt, st, order_id]
        );
        remaining -= pay;
        custId = custId || o.rows[0].customer_id;
      }
    } else if (custId) {
      const debts = await client.query(
        `SELECT * FROM orders
         WHERE customer_id = $1 AND debt_amount > 0
         ORDER BY ordered_at ASC`,
        [custId]
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

    const payIns = await client.query(
      `INSERT INTO payments (order_id, customer_id, amount, method, note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [order_id || null, custId, sum, method || 'cash', note || null]
    );

    await client.query('COMMIT');
    res.status(201).json({
      ok: true,
      data: payIns.rows[0],
      applied: sum - remaining,
      leftover: remaining
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    sendError(res, err);
  } finally {
    client.release();
  }
});

// ========== EXPENSES ==========
app.get('/api/expenses', async (req, res) => {
  try {
    const limit = Math.min(num(req.query.limit, 50), 200);
    const r = await pool.query(
      `SELECT e.*, b.batch_code
       FROM expenses e
       LEFT JOIN batches b ON b.id = e.batch_id
       ORDER BY e.id DESC LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, payment_method, batch_id, note, expense_date } = req.body;
    if (!category || num(amount) <= 0) {
      return res.status(400).json({ ok: false, error: 'category va amount majburiy' });
    }
    const r = await pool.query(
      `INSERT INTO expenses (category, amount, payment_method, batch_id, note, expense_date)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, NOW()))
       RETURNING *`,
      [
        String(category).trim(),
        num(amount),
        payment_method || 'cash',
        batch_id || null,
        note || null,
        expense_date || null
      ]
    );
    res.status(201).json({ ok: true, data: r.rows[0] });
  } catch (err) { sendError(res, err); }
});


// ========== STOCK (qoldiq) ==========
app.get('/api/stock/materials', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        m.id,
        m.name,
        m.unit,
        m.price,
        m.initial_stock,
        COALESCE(SUM(CASE WHEN mm.movement_type = 'in' THEN mm.qty ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN mm.movement_type = 'out' THEN mm.qty ELSE 0 END), 0) AS total_out,
        (m.initial_stock
          + COALESCE(SUM(CASE WHEN mm.movement_type = 'in' THEN mm.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN mm.movement_type = 'out' THEN mm.qty ELSE 0 END), 0)
        ) AS balance
      FROM materials m
      LEFT JOIN material_movements mm ON mm.material_id = m.id
      WHERE m.is_active = true
      GROUP BY m.id
      ORDER BY m.name
    `);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.get('/api/stock/products', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        p.id,
        p.sku,
        p.weight_kg,
        p.price,
        COALESCE(pack.total_qty, 0) AS packed_qty,
        COALESCE(sold.sold_qty, 0) AS sold_qty,
        (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) AS balance_qty,
        (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) * p.weight_kg AS balance_kg
      FROM products p
      LEFT JOIN (
        SELECT product_id, SUM(qty) AS total_qty
        FROM packaging
        GROUP BY product_id
      ) pack ON pack.product_id = p.id
      LEFT JOIN (
        SELECT oi.product_id, SUM(oi.qty) AS sold_qty
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status NOT IN ('cancelled', 'rejected')
        GROUP BY oi.product_id
      ) sold ON sold.product_id = p.id
      WHERE p.is_active = true
      ORDER BY p.sku
    `);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

// ========== DASHBOARD ==========
app.get('/api/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const sales = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total
       FROM orders WHERE ordered_at::date = $1 AND status NOT IN ('cancelled','rejected')`,
      [today]
    );
    const expense = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total
       FROM expenses WHERE expense_date::date = $1`,
      [today]
    );
    const debt = await pool.query(
      `SELECT COALESCE(SUM(debt_amount),0) AS total FROM orders WHERE debt_amount > 0`
    );
    const activeBatches = await pool.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(remaining_kg),0) AS kg
       FROM batches WHERE status = 'active'`
    );
    const products = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM products WHERE is_active = true`
    );

    res.json({
      ok: true,
      data: {
        bugungi_savdo: num(sales.rows[0].total),
        bugungi_xarajat: num(expense.rows[0].total),
        jami_qarz: num(debt.rows[0].total),
        faol_partiya: activeBatches.rows[0].cnt,
        quruq_qoldiq_kg: num(activeBatches.rows[0].kg),
        faol_sku: products.rows[0].cnt
      }
    });
  } catch (err) { sendError(res, err); }
});

app.listen(PORT, () => {
  console.log('Server ' + PORT + ' portda ishga tushdi');
});
