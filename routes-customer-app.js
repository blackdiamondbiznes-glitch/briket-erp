/**
 * Mijoz API: Telegram WebApp + PWA
 * SMS OTP yo'q — Telegram initData yoki demo sessiya
 *
 * Env: TELEGRAM_BOT_TOKEN (productionda majburiy)
 * server.js: require('./routes-customer-app')(app, pool, helpers);
 */
const crypto = require('crypto');

module.exports = function registerCustomerApp(app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;
  const SOLD_STATUSES_SQL = helpers.SOLD_STATUSES.map(function (s) { return "'" + s + "'"; }).join(',');

  function validateTelegramInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    try {
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      if (!hash) return null;
      params.delete('hash');
      const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const dataCheckString = entries.map(([k, v]) => k + '=' + v).join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      if (calculated !== hash) return null;

      const authDate = Number(params.get('auth_date') || 0);
      if (authDate && Date.now() / 1000 - authDate > 86400) return null;

      const userRaw = params.get('user');
      if (!userRaw) return null;
      return JSON.parse(userRaw);
    } catch (e) {
      return null;
    }
  }

  function parseUserFromInitData(initData) {
    if (!initData) return null;
    try {
      const params = new URLSearchParams(initData);
      const userRaw = params.get('user');
      if (!userRaw) return null;
      const user = JSON.parse(userRaw);
      if (user && user.id) return user;
    } catch (e) {}
    return null;
  }

  function getTelegramUser(req) {
    const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const allowDemo = process.env.ALLOW_DEMO_CUSTOMER === '1';
    const initData =
      req.headers['x-telegram-init-data'] ||
      (req.body && req.body.initData) ||
      '';

    if (botToken && initData) {
      const user = validateTelegramInitData(initData, botToken);
      if (user && user.id) return { source: 'telegram', user, initData };
    }

    if (allowDemo && initData) {
      const user = parseUserFromInitData(initData);
      if (user && user.id) return { source: 'telegram-unverified', user, initData };
    }

    if (allowDemo) {
      const demoId =
        req.headers['x-demo-telegram-id'] ||
        (req.body && req.body.demo_telegram_id);
      if (demoId) {
        return {
          source: 'demo',
          user: {
            id: String(demoId),
            first_name: (req.body && req.body.name) || 'Demo',
            username: '',
          },
        };
      }
    }

    return null;
  }

  async function upsertCustomerFromTelegram(tgUser) {
    const telegramId = String(tgUser.id);
    const name =
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() ||
      (tgUser.username ? '@' + tgUser.username : 'Telegram mijoz');

    let r = await pool.query(
      'SELECT * FROM customers WHERE telegram_id = $1 LIMIT 1',
      [telegramId]
    );
    if (r.rows.length) {
      const upd = await pool.query(
        `UPDATE customers SET name = COALESCE(NULLIF($1,''), name), updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [name, r.rows[0].id]
      );
      return upd.rows[0];
    }
    r = await pool.query(
      `INSERT INTO customers (name, telegram_id, note, is_active)
       VALUES ($1, $2, $3, true) RETURNING *`,
      [name, telegramId, 'telegram']
    );
    return r.rows[0];
  }

  app.post('/api/customer/auth/telegram', async (req, res) => {
    try {
      const ctx = getTelegramUser(req);
      if (!ctx) {
        return res.status(401).json({
          ok: false,
          error: "Telegram tasdiqlanmadi. Mini app orqali oching yoki bot token tekshiring.",
        });
      }
      const customer = await upsertCustomerFromTelegram(ctx.user);
      res.json({
        ok: true,
        data: {
          customer_id: customer.id,
          name: customer.name,
          phone: customer.phone,
          telegram_id: customer.telegram_id,
          source: ctx.source,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  // Sotilgan holatlar — pending zaxiraga ta'sir qilmaydi (routes-stock bilan bir xil)
  const SOLD_STATUSES = `(${SOLD_STATUSES_SQL})`;

  app.get('/api/customer/catalog', async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT
          p.id, p.sku, p.weight_kg, p.price, p.description, p.image_urls,
          (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) AS balance_qty
        FROM products p
        LEFT JOIN (
          SELECT product_id, SUM(qty) AS total_qty FROM packaging GROUP BY product_id
        ) pack ON pack.product_id = p.id
        LEFT JOIN (
          SELECT oi.product_id, SUM(oi.qty) AS sold_qty
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.status IN (${SOLD_STATUSES_SQL})
          GROUP BY oi.product_id
        ) sold ON sold.product_id = p.id
        WHERE p.is_active = true
        ORDER BY p.sku
      `);
      const data = r.rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        weight_kg: num(row.weight_kg),
        price: num(row.price),
        description: row.description,
        image_urls: row.image_urls || [],
        balance_qty: Math.max(0, num(row.balance_qty)),
        in_stock: num(row.balance_qty) > 0,
      }));
      res.json({ ok: true, count: data.length, data });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/customer/orders', async (req, res) => {
    const client = await pool.connect();
    try {
      const ctx = getTelegramUser(req);
      if (!ctx) {
        return res.status(401).json({ ok: false, error: 'Telegram tasdiqlanmadi. Botda TELEGRAM_BOT_TOKEN va ALLOW_DEMO_CUSTOMER=1 ni tekshiring yoki Mini Appni qayta oching' });
      }
      const customer = await upsertCustomerFromTelegram(ctx.user);
      const { items, phone, address, note, paid_amount } = req.body || {};
      if (!items || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ ok: false, error: "Savat bo'sh" });
      }

      if (phone) {
        await client.query(
          'UPDATE customers SET phone = $1, address = COALESCE($2, address) WHERE id = $3',
          [String(phone), address || null, customer.id]
        );
      }

      let bulkDisc = 3000;
      let bulkMin = 500;
      try {
        const st = await client.query(
          `SELECT key, value FROM settings WHERE key IN ('bulk_discount','bulk_min_qty')`
        );
        st.rows.forEach((row) => {
          if (row.key === 'bulk_discount') bulkDisc = num(row.value, 3000);
          if (row.key === 'bulk_min_qty') bulkMin = num(row.value, 500);
        });
      } catch (e) { /* settings ixtiyoriy */ }

      const totalQty = items.reduce((s, it) => s + Math.max(0, num(it.qty)), 0);
      const useBulk = totalQty >= bulkMin;

      let total = 0;
      const lines = [];
      for (const it of items) {
        const q = num(it.qty);
        if (q <= 0) continue;
        let product = null;
        if (it.product_id) {
          const pr = await client.query(
            'SELECT * FROM products WHERE id = $1 AND is_active = true',
            [it.product_id]
          );
          if (pr.rows.length) product = pr.rows[0];
        }
        if (!product) continue;
        const yirik = num(product.price);
        const asosiy = yirik + bulkDisc;
        const unitPrice = useBulk ? yirik : asosiy;
        const lineTotal = Math.round(unitPrice * q);
        total += lineTotal;
        lines.push({
          product_id: product.id,
          sku: product.sku,
          qty: q,
          unit_price: unitPrice,
          line_total: lineTotal,
        });
      }
      if (!lines.length) {
        return res.status(400).json({ ok: false, error: "Yaroqli mahsulot yo'q" });
      }

      const paid = Math.max(0, num(paid_amount));
      const debt = Math.max(0, total - paid);
      const status = 'pending';

      // Nasiya limidi (faqat qarz bo'lsa)
      const creditLimit = num(customer.credit_limit);
      if (debt > 0 && creditLimit > 0) {
        const dr = await client.query(
          `SELECT COALESCE(SUM(debt_amount), 0) AS total FROM orders
           WHERE customer_id = $1 AND debt_amount > 0
             AND status IN (${SOLD_STATUSES_SQL})`,
          [customer.id]
        );
        const existing = num(dr.rows[0].total);
        if (existing + debt > creditLimit) {
          return res.status(400).json({
            ok: false,
            error: 'Nasiya limiti oshib ketdi',
          });
        }
      }

      const seqR = await client.query("SELECT nextval(pg_get_serial_sequence('orders','id')) AS seq");
      const code =
        'TG-' +
        new Date().toISOString().slice(0, 10).replace(/-/g, '') +
        '-' +
        String(seqR.rows[0].seq).padStart(6, '0');

      await client.query('BEGIN');
      let ord;
      try {
        ord = await client.query(
          `INSERT INTO orders (
             order_code, customer_id, customer_name, phone, status,
             total_amount, paid_amount, debt_amount, source, note
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            code,
            customer.id,
            customer.name,
            phone || customer.phone || null,
            status,
            total,
            paid,
            debt,
            ctx.source === 'telegram' ? 'telegram' : 'pwa',
            note || null,
          ]
        );
      } catch (e) {
        if (e.code === '42703') {
          ord = await client.query(
            `INSERT INTO orders (
               order_code, customer_name, phone, status,
               total_amount, paid_amount, debt_amount, source, note
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              code,
              customer.name,
              phone || customer.phone || null,
              status,
              total,
              paid,
              debt,
              ctx.source === 'telegram' ? 'telegram' : 'pwa',
              note || null,
            ]
          );
        } else throw e;
      }

      for (const line of lines) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, sku, qty, unit_price, line_total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [ord.rows[0].id, line.product_id, line.sku, line.qty, line.unit_price, line.line_total]
        );
      }
      await client.query('COMMIT');

      const itemsOut = await pool.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
        [ord.rows[0].id]
      );
      res.status(201).json({
        ok: true,
        data: { ...ord.rows[0], items: itemsOut.rows },
      });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      sendError(res, err);
    } finally {
      client.release();
    }
  });

  app.get('/api/customer/orders', async (req, res) => {
    try {
      const ctx = getTelegramUser(req);
      if (!ctx) {
        return res.status(401).json({ ok: false, error: 'Avval kiring' });
      }
      const customer = await upsertCustomerFromTelegram(ctx.user);
      const r = await pool.query(
        `SELECT * FROM orders
         WHERE customer_id = $1 OR (customer_id IS NULL AND phone = $2)
         ORDER BY id DESC LIMIT 30`,
        [customer.id, customer.phone || '']
      );
      const data = [];
      for (const o of r.rows) {
        const items = await pool.query(
          'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id',
          [o.id]
        );
        data.push({ ...o, items: items.rows });
      }
      res.json({ ok: true, count: data.length, data });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.post('/api/customer/orders/:id/cancel', async (req, res) => {
    try {
      const ctx = getTelegramUser(req);
      if (!ctx) {
        return res.status(401).json({ ok: false, error: 'Avval kiring' });
      }
      const customer = await upsertCustomerFromTelegram(ctx.user);
      const id = Number(req.params.id);
      const r = await pool.query(
        `SELECT * FROM orders WHERE id = $1 AND (customer_id = $2 OR phone = $3) LIMIT 1`,
        [id, customer.id, customer.phone || '']
      );
      if (!r.rows.length) {
        return res.status(404).json({ ok: false, error: 'Buyurtma topilmadi' });
      }
      const o = r.rows[0];
      if (String(o.status) !== 'pending') {
        return res.status(400).json({
          ok: false,
          error: 'Faqat ko\'rib chiqilayotgan buyurtmani bekor qilish mumkin',
        });
      }
      const upd = await pool.query(
        `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      res.json({ ok: true, data: upd.rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.put('/api/customer/profile', async (req, res) => {
    try {
      const ctx = getTelegramUser(req);
      if (!ctx) {
        return res.status(401).json({ ok: false, error: 'Avval kiring' });
      }
      const customer = await upsertCustomerFromTelegram(ctx.user);
      const { name, phone, address } = req.body || {};
      const r = await pool.query(
        `UPDATE customers SET
           name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [
          name != null ? String(name).trim() : null,
          phone !== undefined ? phone : null,
          address !== undefined ? address : null,
          customer.id,
        ]
      );
      res.json({ ok: true, data: r.rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  });
};
