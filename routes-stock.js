/**
 * Stock + Dashboard — Toshkent vaqti, zavod yuki zaxiradan ayiriladi
 */
module.exports = function (app, pool, helpers) {
  const num = helpers.num;
  const som = helpers.som || function (v, d) { return Math.round(num(v, d)); };
  const sendError = helpers.sendError;
  const tashkentDateStr = helpers.tashkentDateStr;
  const TZ = helpers.TZ || 'Asia/Tashkent';

  const soldList =
    helpers.SOLD_STATUSES && helpers.SOLD_STATUSES.length
      ? helpers.SOLD_STATUSES
      : ['confirmed', 'paid', 'partial', 'closed'];

  const skuStockSql = `
    SELECT
      p.id, p.sku, p.weight_kg, p.price, p.is_active,
      COALESCE(pack.total_qty, 0) AS packed_qty,
      COALESCE(sold.sold_qty, 0) AS sold_qty,
      COALESCE(ship.shipped_qty, 0) AS shipped_qty,
      (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0) - COALESCE(ship.shipped_qty, 0)) AS balance_qty,
      (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0) - COALESCE(ship.shipped_qty, 0)) * p.weight_kg AS balance_kg
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
    ) ship ON ship.product_id = p.id
    WHERE p.is_active = true
    ORDER BY p.sku
  `;

  app.get('/api/stock/materials', async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT
          m.id, m.name, m.unit, m.price, m.initial_stock,
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
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/stock/products', async (req, res) => {
    try {
      const r = await pool.query(skuStockSql, [soldList]);
      res.json({ ok: true, count: r.rows.length, data: r.rows });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/dashboard', async (req, res) => {
    try {
      const settingsR = await pool.query(
        `SELECT key, value FROM settings
         WHERE key IN ('low_stock_qty','low_batch_kg','high_debt_threshold')`
      );
      const cfg = {};
      settingsR.rows.forEach(function (r) { cfg[r.key] = num(r.value); });
      const lowStockQty = cfg.low_stock_qty || 5;
      const lowBatchKg = cfg.low_batch_kg || 50;
      const highDebtThreshold = cfg.high_debt_threshold || 3000000;

      const dayStr = tashkentDateStr();

      const [
        salesToday,
        salesMonth,
        expenseToday,
        expenseMonth,
        packToday,
        packMonth,
        debt,
        activeBatches,
        productsCnt,
        skuStock,
        materialStock,
        batches,
        recentOrders,
        cashToday,
        cashMonth,
      ] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders
           WHERE status = ANY($2::text[])
             AND COALESCE(ordered_at, created_at) >= ($1::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND COALESCE(ordered_at, created_at) < ($1::timestamp AT TIME ZONE 'Asia/Tashkent') + interval '1 day'`,
          [dayStr, soldList]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders
           WHERE status = ANY($2::text[])
             AND COALESCE(ordered_at, created_at) >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND COALESCE(ordered_at, created_at) < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Tashkent')`,
          [dayStr, soldList]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE expense_date >= ($1::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND expense_date < ($1::timestamp AT TIME ZONE 'Asia/Tashkent') + interval '1 day'`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE expense_date >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND expense_date < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Tashkent')`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(qty),0) AS qty
           FROM packaging
           WHERE COALESCE(packed_at, created_at) >= ($1::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND COALESCE(packed_at, created_at) < ($1::timestamp AT TIME ZONE 'Asia/Tashkent') + interval '1 day'`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(qty),0) AS qty
           FROM packaging
           WHERE COALESCE(packed_at, created_at) >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND COALESCE(packed_at, created_at) < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Tashkent')`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(debt_amount),0) AS total FROM orders
           WHERE debt_amount > 0
             AND status = ANY($1::text[])`,
          [soldList]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(remaining_kg),0) AS kg
           FROM batches WHERE status = 'active'`
        ),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM products WHERE is_active = true`),
        pool.query(skuStockSql, [soldList]),
        pool.query(`
          SELECT
            m.id, m.name, m.unit, m.price,
            (m.initial_stock
              + COALESCE(SUM(CASE WHEN mm.movement_type = 'in' THEN mm.qty ELSE 0 END), 0)
              - COALESCE(SUM(CASE WHEN mm.movement_type = 'out' THEN mm.qty ELSE 0 END), 0)
            ) AS balance
          FROM materials m
          LEFT JOIN material_movements mm ON mm.material_id = m.id
          WHERE m.is_active = true
          GROUP BY m.id
          ORDER BY m.name
        `),
        pool.query(
          `SELECT id, batch_code, status, bags_count, dry_kg, packed_kg, remaining_kg, loss_percent, created_at
           FROM batches WHERE status = 'active' ORDER BY id DESC LIMIT 20`
        ),
        pool.query(
          `SELECT id, order_code, customer_name, total_amount, paid_amount, debt_amount, status, created_at
           FROM orders ORDER BY id DESC LIMIT 8`
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM payments
           WHERE paid_at >= ($1::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND paid_at < ($1::timestamp AT TIME ZONE 'Asia/Tashkent') + interval '1 day'`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM payments
           WHERE paid_at >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE 'Asia/Tashkent')
             AND paid_at < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE 'Asia/Tashkent')`,
          [dayStr]
        ),
      ]);

      const sku_stock = skuStock.rows.map((s) => {
        const balance_qty = num(s.balance_qty);
        const price = som(s.price);
        return {
          ...s,
          packed_qty: num(s.packed_qty),
          sold_qty: num(s.sold_qty),
          shipped_qty: num(s.shipped_qty),
          balance_qty,
          balance_kg: num(s.balance_kg),
          value: som(balance_qty * price),
        };
      });

      const material_stock = materialStock.rows.map((m) => {
        const balance = num(m.balance);
        const price = num(m.price);
        return {
          ...m,
          balance,
          value: som(balance * price),
        };
      });

      const alerts = [];
      sku_stock.forEach((s) => {
        if (s.balance_qty < 0) {
          alerts.push({ type: 'danger', text: s.sku + ' manfiy zaxira: ' + s.balance_qty + ' dona' });
        } else if (s.balance_qty > 0 && s.balance_qty <= lowStockQty) {
          alerts.push({ type: 'warning', text: s.sku + ' kam qoldi: ' + s.balance_qty + ' dona' });
        }
      });
      batches.rows.forEach((p) => {
        const q = num(p.remaining_kg);
        if (q > 0 && q < lowBatchKg) {
          alerts.push({
            type: 'warning',
            text: p.batch_code + ' tugashiga yaqin: ' + q.toFixed(1) + ' kg',
          });
        }
      });
      material_stock.forEach((m) => {
        if (m.balance < 0) {
          alerts.push({ type: 'danger', text: m.name + ' manfiy: ' + m.balance + ' ' + m.unit });
        }
      });
      const jamiQarz = som(debt.rows[0].total);
      if (jamiQarz > highDebtThreshold) {
        alerts.push({
          type: 'danger',
          text: 'Jami qarz yuqori: ' + jamiQarz.toLocaleString('uz-UZ') + ' so\'m',
        });
      }

      const quruq = num(activeBatches.rows[0].kg);
      const packTodayKg = num(packToday.rows[0].kg);

      alerts.sort(function (a, b) {
        return (a.type === 'danger' ? 0 : 1) - (b.type === 'danger' ? 0 : 1);
      });

      res.json({
        ok: true,
        data: {
          timezone: TZ,
          business_date: dayStr,
          bugungi_savdo: som(salesToday.rows[0].total),
          bugungi_xarajat: som(expenseToday.rows[0].total),
          bugungi_foyda: som(salesToday.rows[0].total) - som(expenseToday.rows[0].total),
          bugungi_naqd_tushum: som(cashToday.rows[0].total),
          bugungi_qadoq_kg: packTodayKg,
          bugungi_qadoq_qty: num(packToday.rows[0].qty),
          oylik_savdo: som(salesMonth.rows[0].total),
          oylik_xarajat: som(expenseMonth.rows[0].total),
          oylik_foyda: som(salesMonth.rows[0].total) - som(expenseMonth.rows[0].total),
          oylik_naqd_tushum: som(cashMonth.rows[0].total),
          oylik_qadoq_kg: num(packMonth.rows[0].kg),
          oylik_qadoq_qty: num(packMonth.rows[0].qty),
          jami_qarz: jamiQarz,
          faol_partiya: activeBatches.rows[0].cnt,
          quruq_qoldiq_kg: quruq,
          faol_sku: productsCnt.rows[0].cnt,
          sku_stock,
          material_stock,
          active_batches: batches.rows,
          recent_orders: recentOrders.rows,
          alerts,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  });
};
