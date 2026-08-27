require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================= POSTGRESQL (Supabase) =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

pool.query('SELECT NOW() AS now')
  .then((res) => console.log('✅ PostgreSQL ulandi:', res.rows[0].now))
  .catch((err) => console.error('❌ PostgreSQL ulanish xatosi:', err.message));

// Yordamchi
function sendError(res, err, status = 500) {
  console.error(err);
  res.status(status).json({ ok: false, error: err.message || String(err) });
}

// ================= ASOSIY =================
app.get('/', (req, res) => {
  res.json({
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString(),
    version: '1.1.0',
    endpoints: [
      'GET  /health',
      'GET  /api/products',
      'GET  /api/products/:id',
      'POST /api/products',
      'PUT  /api/products/:id',
      'DELETE /api/products/:id',
      'GET  /api/materials',
      'GET  /api/materials/:id',
      'POST /api/materials',
      'PUT  /api/materials/:id',
      'DELETE /api/materials/:id'
    ]
  });
});

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT NOW() AS db_time, current_database() AS db_name'
    );
    res.json({
      ok: true,
      server_time: new Date().toISOString(),
      db_time: result.rows[0].db_time,
      database: result.rows[0].db_name
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ================= PRODUCTS (SKU) =================

// Ro'yxat
app.get('/api/products', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive
      ? 'SELECT * FROM products WHERE is_active = true ORDER BY id'
      : 'SELECT * FROM products ORDER BY id';
    const result = await pool.query(sql);
    res.json({ ok: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    sendError(res, err);
  }
});

// Bitta
app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    sendError(res, err);
  }
});

// Qo'shish
app.post('/api/products', async (req, res) => {
  try {
    const { sku, weight_kg, price, description, image_urls, note, is_active } = req.body;
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ ok: false, error: 'sku majburiy' });
    }
    const result = await pool.query(
      `INSERT INTO products (sku, weight_kg, price, description, image_urls, note, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(sku).trim(),
        Number(weight_kg) || 0,
        Number(price) || 0,
        description || null,
        Array.isArray(image_urls) ? image_urls : [],
        note || null,
        is_active === false || is_active === 0 ? false : true
      ]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Bunday SKU allaqachon mavjud' });
    }
    sendError(res, err);
  }
});

// Yangilash
app.put('/api/products/:id', async (req, res) => {
  try {
    const { sku, weight_kg, price, description, image_urls, note, is_active } = req.body;
    const result = await pool.query(
      `UPDATE products SET
         sku = COALESCE($1, sku),
         weight_kg = COALESCE($2, weight_kg),
         price = COALESCE($3, price),
         description = COALESCE($4, description),
         image_urls = COALESCE($5, image_urls),
         note = COALESCE($6, note),
         is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING *`,
      [
        sku != null ? String(sku).trim() : null,
        weight_kg != null ? Number(weight_kg) : null,
        price != null ? Number(price) : null,
        description !== undefined ? description : null,
        image_urls !== undefined ? (Array.isArray(image_urls) ? image_urls : []) : null,
        note !== undefined ? note : null,
        is_active !== undefined ? !!is_active : null,
        req.params.id
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Bunday SKU allaqachon mavjud' });
    }
    sendError(res, err);
  }
});

// O'chirish (soft: is_active = false)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1' || req.query.hard === 'true';
    let result;
    if (hard) {
      result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);
    } else {
      result = await pool.query(
        'UPDATE products SET is_active = false WHERE id = $1 RETURNING *',
        [req.params.id]
      );
    }
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Mahsulot topilmadi' });
    }
    res.json({ ok: true, data: result.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) {
    sendError(res, err);
  }
});

// ================= MATERIALS (xom ashyo) =================

app.get('/api/materials', async (req, res) => {
  try {
    const onlyActive = req.query.active !== '0' && req.query.active !== 'false';
    const sql = onlyActive
      ? 'SELECT * FROM materials WHERE is_active = true ORDER BY id'
      : 'SELECT * FROM materials ORDER BY id';
    const result = await pool.query(sql);
    res.json({ ok: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/materials/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM materials WHERE id = $1', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/materials', async (req, res) => {
  try {
    const { name, unit, price, initial_stock, note, is_active } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: 'name majburiy' });
    }
    const result = await pool.query(
      `INSERT INTO materials (name, unit, price, initial_stock, note, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        String(name).trim(),
        unit || 'kg',
        Number(price) || 0,
        Number(initial_stock) || 0,
        note || null,
        is_active === false || is_active === 0 ? false : true
      ]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Bunday material allaqachon mavjud' });
    }
    sendError(res, err);
  }
});

app.put('/api/materials/:id', async (req, res) => {
  try {
    const { name, unit, price, initial_stock, note, is_active } = req.body;
    const result = await pool.query(
      `UPDATE materials SET
         name = COALESCE($1, name),
         unit = COALESCE($2, unit),
         price = COALESCE($3, price),
         initial_stock = COALESCE($4, initial_stock),
         note = COALESCE($5, note),
         is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING *`,
      [
        name != null ? String(name).trim() : null,
        unit != null ? unit : null,
        price != null ? Number(price) : null,
        initial_stock != null ? Number(initial_stock) : null,
        note !== undefined ? note : null,
        is_active !== undefined ? !!is_active : null,
        req.params.id
      ]
    );
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    }
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Bunday material allaqachon mavjud' });
    }
    sendError(res, err);
  }
});

app.delete('/api/materials/:id', async (req, res) => {
  try {
    const hard = req.query.hard === '1' || req.query.hard === 'true';
    let result;
    if (hard) {
      result = await pool.query('DELETE FROM materials WHERE id = $1 RETURNING *', [req.params.id]);
    } else {
      result = await pool.query(
        'UPDATE materials SET is_active = false WHERE id = $1 RETURNING *',
        [req.params.id]
      );
    }
    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'Material topilmadi' });
    }
    res.json({ ok: true, data: result.rows[0], deleted: hard ? 'hard' : 'soft' });
  } catch (err) {
    sendError(res, err);
  }
});

// ================= SERVER =================
app.listen(PORT, () => {
  console.log(`Server ${PORT} portda ishga tushdi`);
});
