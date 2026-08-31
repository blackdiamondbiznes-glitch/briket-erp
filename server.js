/**
 * Black Diamond / Briket ERP — asosiy server
 * Render + PostgreSQL (Supabase)
 *
 * Env (majburiy ishlab chiqarishda):
 *   DATABASE_URL, ADMIN_KEY
 * Ixtiyoriy:
 *   PORT, TELEGRAM_BOT_TOKEN, ALLOW_DEMO_CUSTOMER, CORS_ORIGIN, NODE_ENV
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

// Render / proxy orqasida to'g'ri IP va HTTPS
app.set('trust proxy', 1);

// ——— CORS ———
// CORS_ORIGIN=https://your-app.onrender.com yoki vergul bilan bir nechta
const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
const corsOptions = corsOrigin
  ? {
      origin: corsOrigin.split(',').map((s) => s.trim()).filter(Boolean),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'X-Admin-Key',
        'X-Telegram-Init-Data',
        'X-Demo-Telegram-Id',
      ],
      credentials: true,
    }
  : {
      // Dev / birinchi ishga tushirish: ochiq (keyin CORS_ORIGIN qo'ying)
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'X-Admin-Key',
        'X-Telegram-Init-Data',
        'X-Demo-Telegram-Id',
      ],
    };
app.use(cors(corsOptions));

// JSON body limiti (spam / katta payloaddan himoya)
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/mijoz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mijoz.html'));
});

/**
 * Admin API himoyasi.
 * Productionda ADMIN_KEY bo'sh bo'lsa — so'rovlar rad etiladi (ochiq qolmasin).
 * Developmentda kalit yo'q bo'lsa ogohlantirish bilan o'tkaziladi.
 */
function requireAdmin(req, res, next) {
  const key = (process.env.ADMIN_KEY || '').trim();
  if (!key) {
    if (IS_PROD) {
      console.error('CRITICAL: ADMIN_KEY productionda o\'rnatilmagan — API yopiq');
      return res.status(503).json({
        ok: false,
        error: 'Server sozlamasi: ADMIN_KEY kerak. Render Environment ga qo\'ying.',
      });
    }
    console.warn('ADMIN_KEY env yo\'q — developmentda API himoyasiz');
    return next();
  }
  const given = req.headers['x-admin-key'] || req.query.key;
  if (given && String(given) === key) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized — admin kaliti kerak' });
}

// Himoya: /api/* (mijoz API dan tashqari)
// Ochiq: /, /health, /mijoz, /admin, static, /api/customer/*
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/' || req.path === '/health') return next();
  if (req.path.indexOf('/api/customer/') === 0) return next();
  if (req.path.indexOf('/api/') === 0) return requireAdmin(req, res, next);
  return next();
});

// ——— PostgreSQL ———
const databaseUrl = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: databaseUrl || undefined,
  ssl: databaseUrl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool
  .query('SELECT NOW() AS now')
  .then((res) => console.log('PostgreSQL OK:', res.rows[0].now))
  .catch((err) => console.error('PostgreSQL error:', err.message));

function sendError(res, err, status = 500) {
  console.error(err);
  const message = err && err.message ? err.message : String(err);
  // Productionda ichki xabarlarni yashirish (ixtiyoriy yumshoq)
  if (IS_PROD && status >= 500) {
    return res.status(status).json({ ok: false, error: 'Server xatosi' });
  }
  res.status(status).json({ ok: false, error: message });
}

function num(v, def = 0) {
  const n = Number(v);
  return isNaN(n) ? def : n;
}

const helpers = { num, sendError };

app.get('/', (req, res) => {
  res.json({
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString(),
    version: '2.1.1',
    env: IS_PROD ? 'production' : 'development',
    modules: [
      'products',
      'materials',
      'customers',
      'partners',
      'batches',
      'packaging',
      'material-movements',
      'orders',
      'payments',
      'expenses',
      'shipments',
      'settings',
      'stock',
      'dashboard',
      'pricing',
      'customer-app',
    ],
  });
});

app.get('/health', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT NOW() AS db_time, current_database() AS db_name'
    );
    res.json({
      ok: true,
      server_time: new Date().toISOString(),
      db_time: r.rows[0].db_time,
      database: r.rows[0].db_name,
      admin_key_set: Boolean((process.env.ADMIN_KEY || '').trim()),
    });
  } catch (err) {
    sendError(res, err);
  }
});

const routeFiles = [
  './routes-catalog',
  './routes-customers',
  './routes-production',
  './routes-sales',
  './routes-stock',
  './v2-routes',
  './routes-customer-app',
];

for (const f of routeFiles) {
  try {
    require(f)(app, pool, helpers);
    console.log(f, 'yuklandi');
  } catch (e) {
    console.error(f, 'yuklanmadi:', e.message);
  }
}

// Noma'lum marshrut
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Topilmadi: ' + req.method + ' ' + req.path });
});

// Express xato tutuvchi
app.use((err, req, res, next) => {
  sendError(res, err, err.status || 500);
});

const server = app.listen(PORT, () => {
  console.log('Server ' + PORT + ' portda ishga tushdi (' + (IS_PROD ? 'production' : 'development') + ')');
  if (!(process.env.ADMIN_KEY || '').trim()) {
    console.warn('⚠ ADMIN_KEY yo\'q — productionda API yopiq bo\'ladi');
  }
});

// Render / container to'xtaganda ulanishlarni yopish
function shutdown(signal) {
  console.log(signal + ' — server yopilmoqda...');
  server.close(() => {
    pool.end().then(() => process.exit(0)).catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
