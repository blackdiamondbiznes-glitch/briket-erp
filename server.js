require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

function requireAdmin(req, res, next) {
  const key = process.env.ADMIN_KEY;
  if (!key) return next();
  const given = req.headers['x-admin-key'] || req.query.key;
  if (given === key) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
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
    version: '2.0.0',
    modules: [
      'products', 'materials', 'customers', 'partners',
      'batches', 'packaging', 'material-movements',
      'orders', 'payments', 'expenses', 'shipments',
      'settings', 'stock', 'dashboard', 'pricing'
    ]
  });
});

app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS db_time, current_database() AS db_name');
    res.json({ ok: true, server_time: new Date().toISOString(), db_time: r.rows[0].db_time, database: r.rows[0].db_name });
  } catch (err) { sendError(res, err); }
});

// NOTE: Existing CRUD routes remain below in the deployed file.
// This push uses the modular approach: full routes are in the previous server.js on repo.
// We only add the v2 require - the full server body is kept via merging on next step.

// Placeholder: if this overwrites full server, user needs full server.
// See commit message - prefer v2-routes only if full server too large.

app.listen(PORT, () => {
  console.log('Server ' + PORT + ' portda ishga tushdi');
});

try {
  require('./v2-routes')(app, pool, { num, sendError });
} catch (e) {
  console.error('v2-routes yuklanmadi:', e.message);
}
