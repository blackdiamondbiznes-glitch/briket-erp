/**
 * Black Diamond / Briket ERP — asosiy server
 * Render + PostgreSQL (Supabase)
 *
 * Env (production majburiy):
 *   DATABASE_URL, ADMIN_KEY, CORS_ORIGIN, NODE_ENV=production
 * Ixtiyoriy:
 *   PORT, TELEGRAM_BOT_TOKEN, ALLOW_DEMO_CUSTOMER
 */
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const APP_VERSION = '2.1.2';

// ——— Boot: majburiy env (fail-fast) ———
function requireEnv(name) {
  const v = (process.env[name] || '').trim();
  if (!v) {
    console.error('CRITICAL: ' + name + ' o\'rnatilmagan — server ishga tushmaydi');
    process.exit(1);
  }
  return v;
}

if (IS_PROD) {
  requireEnv('DATABASE_URL');
  requireEnv('ADMIN_KEY');
  requireEnv('CORS_ORIGIN');
} else if (!(process.env.DATABASE_URL || '').trim()) {
  console.warn('⚠ DATABASE_URL yo\'q — developmentda DB so\'rovlari xato beradi');
}

const app = express();
app.set('trust proxy', 1);

// ——— Xavfsizlik headerlari ———
app.use(
  helmet({
    // Admin/mijoz HTML bir originda — CSP keyinroq qattiqlashtiriladi
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ——— CORS (production: fail-closed) ———
const corsOriginRaw = (process.env.CORS_ORIGIN || '').trim();
const allowedOrigins = corsOriginRaw
  ? corsOriginRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

if (IS_PROD && allowedOrigins.length === 0) {
  console.error('CRITICAL: productionda CORS_ORIGIN bo\'sh — server to\'xtadi');
  process.exit(1);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Server-to-server / curl (Origin yo'q) — ruxsat
    if (!origin) return callback(null, true);
    if (!IS_PROD && allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error('CORS: origin ruxsat etilmagan'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'X-Admin-Key',
    'X-Operator-Name',
    'X-Telegram-Init-Data',
    'X-Demo-Telegram-Id',
  ],
  credentials: true,
};
app.use(cors(corsOptions));

// CORS xatosini JSON qilib qaytarish
app.use(function (err, req, res, next) {
  if (err && err.message && err.message.indexOf('CORS') === 0) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  return next(err);
});

// ——— Rate limit ———
// Umumiy API: daqiqasiga 300 so'rov / IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Juda ko\'p so\'rov — biroz kuting' },
});
// Faqat muvaffaqiyatsiz auth (401) urinishlari: daqiqasiga 20 / IP
// Muvaffaqiyatli so'rovlar hisobga olinmaydi (admin ishlashi to'xtamaydi)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { ok: false, error: 'Juda ko\'p urinish — biroz kuting' },
});

app.use('/api/', apiLimiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/mijoz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mijoz.html'));
});

/**
 * Admin kalitini vaqt-xavfsiz solishtirish (timing-attack himoya)
 * Faqat X-Admin-Key header — query (?key=) qabul qilinmaydi
 */
function safeEqualString(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    // Uzunlik farqi ham vaqt sizib chiqmasin — dummy compare
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

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

  // Faqat header (query orqali kalit — taqiqlangan)
  const given = req.headers['x-admin-key'];
  if (given && safeEqualString(given, key)) return next();

  // Faqat muvaffaqiyatsiz urinishlar rate-limit ostida
  return authLimiter(req, res, () => {
    res.status(401).json({ ok: false, error: 'Unauthorized — admin kaliti kerak' });
  });
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
const databaseUrl = (process.env.DATABASE_URL || '').trim();
// Supabase/Render odatda managed cert — rejectUnauthorized:false amaliy zarurat.
// Keyinroq CA fayl bilan true qilish mumkin (PG_SSL_CA env).
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
  .catch((err) => {
    console.error('PostgreSQL error:', err.message);
    if (IS_PROD) {
      console.error('CRITICAL: DB ulanmadi — productionda ishlash xavfli');
    }
  });

function sendError(res, err, status) {
  status = status || 500;
  console.error(err);
  const message = err && err.message ? err.message : String(err);
  if (IS_PROD && status >= 500) {
    return res.status(status).json({ ok: false, error: 'Server xatosi' });
  }
  res.status(status).json({ ok: false, error: message });
}

function num(v, def) {
  if (def === undefined) def = 0;
  const n = Number(v);
  return isNaN(n) ? def : n;
}

const SOLD_STATUSES = ['confirmed', 'paid', 'partial', 'closed'];
const helpers = { num, sendError, SOLD_STATUSES };

app.get('/', (req, res) => {
  res.json({
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString(),
    version: APP_VERSION,
    env: IS_PROD ? 'production' : 'development',
  });
});

// /health — minimal (recon uchun ortiqcha ma'lumot yo'q)
app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS db_time');
    res.json({
      ok: true,
      server_time: new Date().toISOString(),
      db_time: r.rows[0].db_time,
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'DB ulanmagan' });
  }
});

// ——— Route yuklash (kritik: fail-fast) ———
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
    if (IS_PROD) {
      console.error('CRITICAL: route yuklanmadi — server to\'xtatiladi');
      process.exit(1);
    }
  }
}

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Topilmadi: ' + req.method + ' ' + req.path });
});

app.use((err, req, res, next) => {
  sendError(res, err, err.status || 500);
});

const server = app.listen(PORT, () => {
  console.log(
    'Server ' + PORT + ' portda (' + (IS_PROD ? 'production' : 'development') + ') v' + APP_VERSION
  );
});

function shutdown(signal) {
  console.log(signal + ' — server yopilmoqda...');
  server.close(() => {
    pool
      .end()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
