/**
 * Stock + expanded Dashboard (eski tizimdagi ko'rsatkichlar)
 * server.js: require('./routes-stock')(app, pool, helpers);
 */
module.exports = function (app, pool, helpers) {
  const num = helpers.num;
  const sendError = helpers.sendError;

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

  // Sotilgan deb hisoblanadigan holatlar (admin tasdiqlagan / yakunlangan)
  // pending — hali tasdiqlanmagan, zaxiraga ta'sir qilmaydi
  const SOLD_STATUSES = `('confirmed', 'paid', 'partial', 'closed')`;

  app.get('/api/stock/products', async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT
          p.id, p.sku, p.weight_kg, p.price,
          COALESCE(pack.total_qty, 0) AS packed_qty,
          COALESCE(sold.sold_qty, 0) AS sold_qty,
          (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) AS balance_qty,
          (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) * p.weight_kg AS balance_kg
        FROM products p
        LEFT JOIN (
          SELECT product_id, SUM(qty) AS total_qty FROM packaging GROUP BY product_id
        ) pack ON pack.product_id = p.id
        LEFT JOIN (
          SELECT oi.product_id, SUM(oi.qty) AS sold_qty
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE o.status IN ${SOLD_STATUSES}
          GROUP BY oi.product_id
        ) sold ON sold.product_id = p.id
        WHERE p.is_active = true
        ORDER BY p.sku
      `);
      res.json({ ok: true, count: r.rows.length, data: r.rows });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.get('/api/dashboard', async (req, res) => {
    try {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const dayStr = `${y}-${m}-${d}`;
      const monthStr = `${y}-${m}`;

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
      ] = await Promise.all([
        pool.query(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders
           WHERE status IN ('confirmed','paid','partial','closed')
             AND created_at::date = $1::date`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders
           WHERE status IN ('confirmed','paid','partial','closed')
             AND to_char(created_at, 'YYYY-MM') = $1`,
          [monthStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE expense_date::date = $1::date`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE to_char(expense_date, 'YYYY-MM') = $1`,
          [monthStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(qty),0) AS qty
           FROM packaging WHERE created_at::date = $1::date`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(qty),0) AS qty
           FROM packaging WHERE to_char(created_at, 'YYYY-MM') = $1`,
          [monthStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(debt_amount),0) AS total FROM orders
           WHERE debt_amount > 0
             AND status IN ('confirmed','paid','partial','closed')`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(remaining_kg),0) AS kg
           FROM batches WHERE status = 'active'`
        ),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM products WHERE is_active = true`),
        pool.query(`
          SELECT
            p.id, p.sku, p.weight_kg, p.price, p.is_active,
            COALESCE(pack.total_qty, 0) AS packed_qty,
            COALESCE(sold.sold_qty, 0) AS sold_qty,
            (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) AS balance_qty,
            (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0)) * p.weight_kg AS balance_kg
          FROM products p
          LEFT JOIN (
            SELECT product_id, SUM(qty) AS total_qty FROM packaging GROUP BY product_id
          ) pack ON pack.product_id = p.id
          LEFT JOIN (
            SELECT oi.product_id, SUM(oi.qty) AS sold_qty
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status IN ('confirmed','paid','partial','closed')
            GROUP BY oi.product_id
          ) sold ON sold.product_id = p.id
          WHERE p.is_active = true
          ORDER BY p.sku
        `),
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
      ]);

      const sku_stock = skuStock.rows.map((s) => {
        const balance_qty = num(s.balance_qty);
        const price = num(s.price);
        return {
          ...s,
          balance_qty,
          balance_kg: num(s.balance_kg),
          value: Math.round(balance_qty * price),
        };
      });

      const material_stock = materialStock.rows.map((m) => {
        const balance = num(m.balance);
        const price = num(m.price);
        return {
          ...m,
          balance,
          value: Math.round(balance * price * 100) / 100,
        };
      });

      const alerts = [];
      sku_stock.forEach((s) => {
        if (s.balance_qty < 0) {
          alerts.push({ type: 'danger', text: s.sku + ' manfiy zaxira: ' + s.balance_qty + ' dona' });
        } else if (s.balance_qty > 0 && s.balance_qty <= 5) {
          alerts.push({ type: 'warning', text: s.sku + ' kam qoldi: ' + s.balance_qty + ' dona' });
        }
      });
      batches.rows.forEach((p) => {
        const q = num(p.remaining_kg);
        if (q > 0 && q < 50) {
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
      const jamiQarz = num(debt.rows[0].total);
      if (jamiQarz > 3000000) {
        alerts.push({
          type: 'danger',
          text: 'Jami qarz yuqori: ' + Math.round(jamiQarz).toLocaleString('uz-UZ') + ' som',
        });
      }

      const quruq = num(activeBatches.rows[0].kg);
      const packTodayKg = num(packToday.rows[0].kg);

      res.json({
        ok: true,
        data: {
          bugungi_savdo: num(salesToday.rows[0].total),
          bugungi_xarajat: num(expenseToday.rows[0].total),
          bugungi_qadoq_kg: packTodayKg,
          bugungi_qadoq_qty: num(packToday.rows[0].qty),
          oylik_savdo: num(salesMonth.rows[0].total),
          oylik_xarajat: num(expenseMonth.rows[0].total),
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
