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

  // Eski tizim: tan narx = ko'mir(kg) + reka + parafin + paket + qadoq ish haqi.
  // cost_price > 0 bo'lsa qo'lda ustun.
  const QOP_KG = 27;
  const DEFAULT_PACK_WAGE = 700;

  function normName(s) {
    return String(s || '').toLowerCase().replace(/ʻ|’/g, "'");
  }
  function findMat(mats, tests) {
    for (let i = 0; i < mats.length; i++) {
      const n = normName(mats[i].name);
      const u = normName(mats[i].unit);
      for (let t = 0; t < tests.length; t++) {
        if (tests[t](n, u)) return mats[i];
      }
    }
    return null;
  }
  function defaultRetsept(sku, weightKg) {
    const n = normName(sku);
    const w = num(weightKg) || 1;
    if (n.indexOf('starter') !== -1) return { reka: 7 * w, parafin_g: 105 * w };
    if (n.indexOf('aktiv') !== -1) return { reka: 0, parafin_g: 250 * w };
    return { reka: 0, parafin_g: 0 };
  }

  async function loadCostContext() {
    const [mats, recs, wages] = await Promise.all([
      pool.query('SELECT id, name, unit, price FROM materials WHERE is_active = true'),
      pool.query(`SELECT r.product_id, r.qty, r.line_amount, m.name, m.unit, m.price
                  FROM recipes r JOIN materials m ON m.id = r.material_id`),
      pool.query(`SELECT product_id, AVG(unit_wage) AS avg_wage FROM packaging GROUP BY product_id`)
    ]);
    const recByPid = {};
    recs.rows.forEach(function (r) {
      if (!recByPid[r.product_id]) recByPid[r.product_id] = [];
      recByPid[r.product_id].push(r);
    });
    const wageByPid = {};
    wages.rows.forEach(function (r) { wageByPid[r.product_id] = num(r.avg_wage); });
    return { mats: mats.rows, recByPid: recByPid, wageByPid: wageByPid };
  }

  function unitCostFor(s, ctx) {
    const override = som(s.cost_price);
    const weight = num(s.weight_kg);
    const packWage = ctx.wageByPid[s.id] > 0 ? som(ctx.wageByPid[s.id]) : DEFAULT_PACK_WAGE;
    const recs = ctx.recByPid[s.id] || [];
    let recipeCost = 0;
    let parts = { komir: 0, reka: 0, parafin: 0, paket: 0, wage: packWage, recipe: 0 };

    if (recs.length) {
      recs.forEach(function (r) {
        const line = r.line_amount != null && r.line_amount !== ''
          ? som(r.line_amount)
          : som(num(r.qty) * num(r.price));
        recipeCost += line;
      });
      parts.recipe = som(recipeCost);
      parts.lines = recs.map(function (r) {
        const line = r.line_amount != null && r.line_amount !== ''
          ? som(r.line_amount)
          : som(num(r.qty) * num(r.price));
        return { name: r.name, qty: num(r.qty), unit: r.unit, amount: line };
      });
    } else {
      const coal = findMat(ctx.mats, [
        function (n, u) { return n.indexOf("ko'mir") !== -1 || n.indexOf('komir') !== -1 || n.indexOf("ko‘mir") !== -1; },
        function (n, u) { return u === 'qop'; }
      ]);
      const reka = findMat(ctx.mats, [function (n) { return n.indexOf('reka') !== -1; }]);
      const paraf = findMat(ctx.mats, [function (n) { return n.indexOf('paraf') !== -1; }]);
      const def = defaultRetsept(s.sku, weight);
      if (coal) {
        const coalPerKg = normName(coal.unit) === 'qop' ? num(coal.price) / QOP_KG : num(coal.price);
        parts.komir = som(weight * coalPerKg);
      }
      if (reka && def.reka) parts.reka = som(def.reka * num(reka.price));
      if (paraf && def.parafin_g) parts.parafin = som((def.parafin_g / 1000) * num(paraf.price));
      const paketName = weight === 1.5 ? '1.5' : String(weight);
      const paket = findMat(ctx.mats, [
        function (n) { return n.indexOf('paket') !== -1 && n.indexOf(paketName) !== -1; }
      ]);
      if (paket) parts.paket = som(paket.price);
    }

    const computed = recs.length
      ? som(recipeCost)
      : som(parts.komir + parts.reka + parts.parafin + parts.paket + parts.wage);
    const used = override > 0 ? override : computed;
    return {
      unit_cost: used,
      cost_computed: computed,
      cost_override: override > 0,
      cost_parts: recs.length ? { recipe: parts.recipe, wage: packWage } : parts
    };
  }

  function mapStockRow(s, ctx) {
    const balance_qty = num(s.balance_qty);
    const price = som(s.price);
    const c = unitCostFor(s, ctx);
    const cost = c.unit_cost;
    const profit_unit = som(price - cost);
    return {
      ...s,
      packed_qty: num(s.packed_qty),
      sold_qty: num(s.sold_qty),
      shipped_qty: num(s.shipped_qty),
      balance_qty: balance_qty,
      balance_kg: num(s.balance_kg),
      cost_price: cost,
      unitCost: cost,
      sell_price: price,
      price: price,
      profit_unit: profit_unit,
      margin: profit_unit,
      value: som(balance_qty * price),
      cost_value: som(balance_qty * cost),
      costValue: som(balance_qty * cost),
      profit_value: som(balance_qty * profit_unit),
      potentialProfit: som(balance_qty * profit_unit),
      cost_computed: c.cost_computed,
      cost_override: c.cost_override,
      cost_parts: c.cost_parts
    };
  }

  const skuStockSql = `
    SELECT
      p.id, p.sku, p.weight_kg, p.price, p.cost_price, p.is_active,
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
      const ctx = await loadCostContext();
      const data = r.rows.map(function (s) { return mapStockRow(s, ctx); });
      res.json({ ok: true, count: data.length, data: data });
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
             AND COALESCE(ordered_at, created_at) >= ($1::timestamp AT TIME ZONE '${TZ}')
             AND COALESCE(ordered_at, created_at) < ($1::timestamp AT TIME ZONE '${TZ}') + interval '1 day'`,
          [dayStr, soldList]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders
           WHERE status = ANY($2::text[])
             AND COALESCE(ordered_at, created_at) >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')
             AND COALESCE(ordered_at, created_at) < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`,
          [dayStr, soldList]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE expense_date >= ($1::timestamp AT TIME ZONE '${TZ}')
             AND expense_date < ($1::timestamp AT TIME ZONE '${TZ}') + interval '1 day'`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM expenses
           WHERE expense_date >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')
             AND expense_date < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(qty),0) AS qty
           FROM packaging
           WHERE COALESCE(packed_at, created_at) >= ($1::timestamp AT TIME ZONE '${TZ}')
             AND COALESCE(packed_at, created_at) < ($1::timestamp AT TIME ZONE '${TZ}') + interval '1 day'`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(kg),0) AS kg, COALESCE(SUM(qty),0) AS qty
           FROM packaging
           WHERE COALESCE(packed_at, created_at) >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')
             AND COALESCE(packed_at, created_at) < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`,
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
           WHERE paid_at >= ($1::timestamp AT TIME ZONE '${TZ}')
             AND paid_at < ($1::timestamp AT TIME ZONE '${TZ}') + interval '1 day'`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount),0) AS total FROM payments
           WHERE paid_at >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')
             AND paid_at < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`,
          [dayStr]
        ),
      ]);

      const costCtx = await loadCostContext();
      const sku_stock = skuStock.rows.map(function (s) { return mapStockRow(s, costCtx); });

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
