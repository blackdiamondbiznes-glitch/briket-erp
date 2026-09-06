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
const APP_VERSION = '2.1.3';
const TZ = 'Asia/Tashkent';

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
  if (process.env.ALLOW_DEMO_CUSTOMER === '1') {
    console.error(
      'CRITICAL: ALLOW_DEMO_CUSTOMER productionda yoqilgan — bu xavfsizlik xavfi, o\'chiring.'
    );
    process.exit(1);
  }
} else if (!(process.env.DATABASE_URL || '').trim()) {
  console.warn('⚠ DATABASE_URL yo\'q — developmentda DB so\'rovlari xato beradi');
}

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

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

app.use(function (err, req, res, next) {
  if (err && err.message && err.message.indexOf('CORS') === 0) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  return next(err);
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Juda ko\'p so\'rov — biroz kuting' },
});
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
app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/admin.html', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/mijoz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mijoz.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

function safeEqualString(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(req, res, next) {
  const key = (process.env.ADMIN_KEY || '').trim();
  if (!key) {
    if (IS_PROD) {
      return res.status(503).json({
        ok: false,
        error: 'Server sozlamasi: ADMIN_KEY kerak. Render Environment ga qo\'ying.',
      });
    }
    return next();
  }
  const given = req.headers['x-admin-key'];
  if (given && safeEqualString(given, key)) return next();
  return authLimiter(req, res, () => {
    res.status(401).json({ ok: false, error: 'Unauthorized — admin kaliti kerak' });
  });
}

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/' || req.path === '/health') return next();
  if (req.path.indexOf('/api/customer/') === 0) return next();
  if (req.path.indexOf('/api/') === 0) return requireAdmin(req, res, next);
  return next();
});

const databaseUrl = (process.env.DATABASE_URL || '').trim();
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
  });

function sendError(res, err, status) {
  status = status || err.status || 500;
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

function som(v, def) {
  return Math.round(num(v, def));
}

function tashkentDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d || new Date());
}

function uniqueTmpCode(prefix) {
  return (
    prefix +
    '-' +
    Date.now().toString(36) +
    '-' +
    crypto.randomBytes(3).toString('hex')
  );
}

const SOLD_STATUSES = ['confirmed', 'paid', 'partial', 'closed'];
const CREDIT_DEBT_STATUSES = ['pending', 'confirmed', 'paid', 'partial', 'closed'];

async function checkCreditLimit(client, customerId, newDebt) {
  const debtAdd = Math.max(0, som(newDebt));
  if (!customerId || debtAdd <= 0) {
    return { ok: true, existingDebt: 0, creditLimit: 0 };
  }
  const locked = await client.query(
    'SELECT id, credit_limit FROM customers WHERE id = $1 FOR UPDATE',
    [customerId]
  );
  if (!locked.rows.length) {
    return { ok: false, existingDebt: 0, creditLimit: 0, error: 'Mijoz topilmadi' };
  }
  const creditLimit = som(locked.rows[0].credit_limit);
  if (creditLimit <= 0) {
    return { ok: true, existingDebt: 0, creditLimit: 0 };
  }
  const debtR = await client.query(
    `SELECT COALESCE(SUM(debt_amount), 0) AS total FROM orders
     WHERE customer_id = $1 AND debt_amount > 0 AND status = ANY($2::text[])`,
    [customerId, CREDIT_DEBT_STATUSES]
  );
  const existingDebt = som(debtR.rows[0].total);
  if (existingDebt + debtAdd > creditLimit) {
    return {
      ok: false,
      existingDebt: existingDebt,
      creditLimit: creditLimit,
      error:
        'Nasiya limiti yetarli emas. Limit: ' +
        creditLimit.toLocaleString('uz-UZ') +
        ' so\'m, mavjud qarz: ' +
        existingDebt.toLocaleString('uz-UZ') +
        ' so\'m, yangi qarz: ' +
        debtAdd.toLocaleString('uz-UZ') +
        ' so\'m',
    };
  }
  return { ok: true, existingDebt: existingDebt, creditLimit: creditLimit };
}

async function getProductBalanceMap(client) {
  const r = await client.query(
    `SELECT
       p.id,
       p.sku,
       (COALESCE(pack.total_qty, 0)
         - COALESCE(sold.sold_qty, 0)
         - COALESCE(ship.shipped_qty, 0)) AS balance_qty
     FROM products p
     LEFT JOIN (
       SELECT product_id, SUM(qty) AS total_qty FROM packaging GROUP BY product_id
     ) pack ON pack.product_id = p.id
     LEFT JOIN (
       SELECT oi.product_id, SUM(oi.qty) AS sold_qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = ANY($1::text[])
       GROUP BY oi.product_id
     ) sold ON sold.product_id = p.id
     LEFT JOIN (
       SELECT product_id, SUM(qty - COALESCE(returned_qty, 0)) AS shipped_qty
       FROM shipments
       WHERE from_type = 'factory'
       GROUP BY product_id
     ) ship ON ship.product_id = p.id`,
    [SOLD_STATUSES]
  );
  const map = {};
  r.rows.forEach(function (row) {
    map[String(row.id)] = num(row.balance_qty);
  });
  return map;
}

async function assertStockForLines(client, lines, extraByProduct) {
  extraByProduct = extraByProduct || {};
  const map = await getProductBalanceMap(client);
  const need = {};
  for (const line of lines) {
    if (!line.product_id) continue;
    const q = num(line.qty);
    if (q <= 0) continue;
    const k = String(line.product_id);
    need[k] = (need[k] || 0) + q;
  }
  const keys = Object.keys(need);
  for (let i = 0; i < keys.length; i++) {
    const id = keys[i];
    const have = num(map[id]) + num(extraByProduct[id]);
    if (need[id] > have + 0.0001) {
      const skuR = await client.query('SELECT sku FROM products WHERE id = $1', [id]);
      const sku = skuR.rows.length ? skuR.rows[0].sku : ('#' + id);
      const err = new Error(
        'Zaxira yetarli emas: ' +
          sku +
          ' (bor: ' +
          have +
          ' dona, kerak: ' +
          need[id] +
          ' dona)'
      );
      err.status = 400;
      throw err;
    }
  }
}

const helpers = {
  num,
  som,
  sendError,
  SOLD_STATUSES,
  CREDIT_DEBT_STATUSES,
  checkCreditLimit,
  tashkentDateStr,
  uniqueTmpCode,
  TZ,
  getProductBalanceMap,
  assertStockForLines,
};

app.get('/', (req, res) => {
  res.json({
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString(),
    tashkent_date: tashkentDateStr(),
    version: APP_VERSION,
    env: IS_PROD ? 'production' : 'development',
  });
});

app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS db_time');
    res.json({
      ok: true,
      server_time: new Date().toISOString(),
      tashkent_date: tashkentDateStr(),
      db_time: r.rows[0].db_time,
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'DB ulanmagan' });
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
    if (IS_PROD) {
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
    pool.end().then(() => process.exit(0)).catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
