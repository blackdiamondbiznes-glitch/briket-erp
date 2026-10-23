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

  const stockCost = require('./lib/stock-cost');

  function loadCostContext() {
    return stockCost.loadCostContext(pool);
  }

  function mapStockRow(s, ctx) {
    const balance_qty = num(s.balance_qty);
    const c = stockCost.unitCostFor(s, ctx);
    // figures: unitCost = tannarx, margin = sotish − tannarx. Almashtirilmaydi.
    const figs = stockCost.figures(s.price, c.unit_cost, balance_qty);
    return {
      ...s,
      packed_qty: num(s.packed_qty),
      sold_qty: num(s.sold_qty),
      shipped_qty: num(s.shipped_qty),
      balance_qty: balance_qty,
      balance_kg: num(s.balance_kg),
      cost_price: figs.unitCost,
      unitCost: figs.unitCost,
      sell_price: figs.sell_price,
      price: figs.price,
      profit_unit: figs.profit_unit,
      margin: figs.margin,
      value: figs.value,
      cost_value: figs.cost_value,
      costValue: figs.costValue,
      profit_value: figs.profit_value,
      potentialProfit: figs.potentialProfit,
      yolda_qty: num(s.yolda_qty),
      cost_computed: c.cost_computed,
      cost_override: c.cost_override,
      cost_parts: c.cost_parts
    };
  }

  const skuStockSqlFull = `
    SELECT
      p.id, p.sku, p.weight_kg, p.price, p.cost_price, p.is_active,
      COALESCE(pack.total_qty, 0) AS packed_qty,
      (COALESCE(sold.sold_qty, 0) + COALESCE(field.field_qty, 0)) AS sold_qty,
      COALESCE(ship.shipped_qty, 0) AS shipped_qty,
      COALESCE(yolda.yolda_qty, 0) AS yolda_qty,
      (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0) - COALESCE(field.field_qty, 0) - COALESCE(ship.shipped_qty, 0) - COALESCE(road.held_qty, 0)) AS balance_qty,
      (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0) - COALESCE(field.field_qty, 0) - COALESCE(ship.shipped_qty, 0) - COALESCE(road.held_qty, 0)) * p.weight_kg AS balance_kg
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
    LEFT JOIN (
      SELECT wi.product_id, SUM(wi.quantity) AS field_qty
      FROM waybill_items wi
      JOIN waybills w ON w.id = wi.waybill_id
      WHERE w.stock_posted = true AND w.reys_id IS NULL
      GROUP BY wi.product_id
    ) field ON field.product_id = p.id
    LEFT JOIN (
      SELECT ri.product_id, SUM(ri.loaded_qty - ri.returned_qty) AS held_qty
      FROM reys_items ri
      GROUP BY ri.product_id
    ) road ON road.product_id = p.id
    LEFT JOIN (
      SELECT ri.product_id,
             SUM(ri.loaded_qty - COALESCE(sold_trip.qty, 0)) AS yolda_qty
      FROM reys_items ri
      JOIN reyslar r ON r.id = ri.reys_id AND r.status = 'open'
      LEFT JOIN (
        SELECT w.reys_id, wi.product_id, SUM(wi.quantity) AS qty
        FROM waybill_items wi
        JOIN waybills w ON w.id = wi.waybill_id
        WHERE w.reys_id IS NOT NULL
        GROUP BY w.reys_id, wi.product_id
      ) sold_trip ON sold_trip.reys_id = ri.reys_id AND sold_trip.product_id = ri.product_id
      GROUP BY ri.product_id
    ) yolda ON yolda.product_id = p.id
    WHERE p.is_active = true
    ORDER BY p.sku
  `;

  const skuStockSql = `
    SELECT
      p.id, p.sku, p.weight_kg, p.price, p.cost_price, p.is_active,
      COALESCE(pack.total_qty, 0) AS packed_qty,
      (COALESCE(sold.sold_qty, 0) + COALESCE(field.field_qty, 0)) AS sold_qty,
      COALESCE(ship.shipped_qty, 0) AS shipped_qty,
      (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0) - COALESCE(field.field_qty, 0) - COALESCE(ship.shipped_qty, 0)) AS balance_qty,
      (COALESCE(pack.total_qty, 0) - COALESCE(sold.sold_qty, 0) - COALESCE(field.field_qty, 0) - COALESCE(ship.shipped_qty, 0)) * p.weight_kg AS balance_kg
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
    LEFT JOIN (
      SELECT wi.product_id, SUM(wi.quantity) AS field_qty
      FROM waybill_items wi
      JOIN waybills w ON w.id = wi.waybill_id
      WHERE w.stock_posted = true
      GROUP BY wi.product_id
    ) field ON field.product_id = p.id
    WHERE p.is_active = true
    ORDER BY p.sku
  `;

  const skuStockSqlPlain = skuStockSql
    .replace(/ \+ COALESCE\(field\.field_qty, 0\)/g, '')
    .replace(/ - COALESCE\(field\.field_qty, 0\)/g, '')
    .replace(/\s*LEFT JOIN \(\s*SELECT wi\.product_id[\s\S]*?\) field ON field\.product_id = p\.id/, '');

  async function querySkuStock() {
    const attempts = [skuStockSqlFull, skuStockSql, skuStockSqlPlain];
    let last;
    for (let i = 0; i < attempts.length; i++) {
      try {
        return await pool.query(attempts[i], [soldList]);
      } catch (err) {
        if (err.code !== '42P01' && err.code !== '42703') throw err;
        last = err;
      }
    }
    throw last;
  }

  function fieldQuery(sql, params, emptyRow) {
    return pool.query(sql, params).then(
      function (r) { return r; },
      function (err) {
        if (err && (err.code === '42P01' || err.code === '42703')) {
          return { rows: emptyRow ? [emptyRow] : [] };
        }
        throw err;
      }
    );
  }

  function fieldQueryTiered(wideSql, narrowSql, params, emptyRow) {
    return pool.query(wideSql, params).then(
      function (r) { return r; },
      function (err) {
        if (err && (err.code === '42P01' || err.code === '42703')) {
          return fieldQuery(narrowSql, params, emptyRow);
        }
        throw err;
      }
    );
  }

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
      const r = await querySkuStock();
      const ctx = await loadCostContext();
      const data = r.rows.map(function (s) { return mapStockRow(s, ctx); });
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendError(res, err);
    }
  });

  function shiftIso(iso, delta) {
    const parts = String(iso).slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function sumBySana(rows) {
    const map = {};
    (rows || []).forEach(function (row) {
      const key = String(row.sana || '').slice(0, 10);
      if (!key) return;
      map[key] = som(row.total);
    });
    return map;
  }

  function mergeTopProducts(orderRows, fieldRows) {
    const map = {};
    function add(rows) {
      (rows || []).forEach(function (row) {
        const name = String(row.name || 'Mahsulot');
        if (!map[name]) map[name] = { name: name, qty: 0, summa: 0 };
        map[name].qty += num(row.qty);
        map[name].summa += som(row.total);
      });
    }
    add(orderRows);
    add(fieldRows);
    return Object.keys(map)
      .map(function (key) { return map[key]; })
      .sort(function (a, b) { return b.summa - a.summa || b.qty - a.qty; })
      .slice(0, 5)
      .map(function (row) {
        return { name: row.name, qty: row.qty, summa: som(row.summa) };
      });
  }

  async function loadDashboardTrends(dayStr) {
    const blank = {
      kunlar: [],
      top_mahsulot: [],
      kecha_savdo: 0,
      kecha_xarajat: 0,
      kecha_foyda: 0,
      kecha_naqd: 0,
      oldingi_oy_savdo: 0,
      oldingi_oy_xarajat: 0,
      oldingi_oy_foyda: 0,
      oldingi_oy_naqd: 0
    };
    try {
      const dayStart = `(($1::date - interval '6 days')::timestamp AT TIME ZONE '${TZ}')`;
      const dayEnd = `(($1::date + interval '1 day')::timestamp AT TIME ZONE '${TZ}')`;
      const prevStart = `((date_trunc('month', $1::date) - interval '1 month')::timestamp AT TIME ZONE '${TZ}')`;
      const monthStart = `(date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')`;
      const [
        orderDays,
        expenseDays,
        cashDays,
        fieldDays,
        prevOrders,
        prevExpenses,
        prevCash,
        prevField,
        topOrders,
        topField
      ] = await Promise.all([
        pool.query(
          `SELECT to_char((COALESCE(ordered_at, created_at) AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS sana,
                  COALESCE(SUM(total_amount), 0) AS total
           FROM orders
           WHERE status = ANY($2::text[])
             AND COALESCE(ordered_at, created_at) >= ${dayStart}
             AND COALESCE(ordered_at, created_at) < ${dayEnd}
           GROUP BY 1`,
          [dayStr, soldList]
        ),
        pool.query(
          `SELECT to_char((expense_date AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS sana,
                  COALESCE(SUM(amount), 0) AS total
           FROM expenses
           WHERE expense_date >= ${dayStart}
             AND expense_date < ${dayEnd}
           GROUP BY 1`,
          [dayStr]
        ),
        pool.query(
          `SELECT to_char((paid_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS sana,
                  COALESCE(SUM(amount), 0) AS total
           FROM payments
           WHERE paid_at >= ${dayStart}
             AND paid_at < ${dayEnd}
           GROUP BY 1`,
          [dayStr]
        ),
        fieldQueryTiered(
          `SELECT to_char(COALESCE(sale_date, (created_at AT TIME ZONE '${TZ}')::date), 'YYYY-MM-DD') AS sana,
                  COALESCE(SUM(total_amount), 0) AS total
           FROM waybills
           WHERE (stock_posted = true OR reys_id IS NOT NULL)
             AND COALESCE(sale_date, (created_at AT TIME ZONE '${TZ}')::date) >= ($1::date - interval '6 days')
             AND COALESCE(sale_date, (created_at AT TIME ZONE '${TZ}')::date) <= $1::date
           GROUP BY 1`,
          `SELECT to_char((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS sana,
                  COALESCE(SUM(total_amount), 0) AS total
           FROM waybills
           WHERE stock_posted = true
             AND created_at >= ${dayStart}
             AND created_at < ${dayEnd}
           GROUP BY 1`,
          [dayStr],
          null
        ),
        pool.query(
          `SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders
           WHERE status = ANY($2::text[])
             AND COALESCE(ordered_at, created_at) >= ${prevStart}
             AND COALESCE(ordered_at, created_at) < ${monthStart}`,
          [dayStr, soldList]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
           WHERE expense_date >= ${prevStart}
             AND expense_date < ${monthStart}`,
          [dayStr]
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
           WHERE paid_at >= ${prevStart}
             AND paid_at < ${monthStart}`,
          [dayStr]
        ),
        fieldQueryTiered(
          `SELECT COALESCE(SUM(total_amount), 0) AS total FROM waybills
           WHERE (stock_posted = true OR reys_id IS NOT NULL)
             AND COALESCE(sale_date, (created_at AT TIME ZONE '${TZ}')::date) >= (date_trunc('month', $1::date) - interval '1 month')::date
             AND COALESCE(sale_date, (created_at AT TIME ZONE '${TZ}')::date) < date_trunc('month', $1::date)::date`,
          `SELECT COALESCE(SUM(total_amount), 0) AS total FROM waybills
           WHERE stock_posted = true
             AND created_at >= ${prevStart}
             AND created_at < ${monthStart}`,
          [dayStr],
          { total: 0 }
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(oi.sku, ''), 'Mahsulot') AS name,
                  COALESCE(SUM(oi.qty), 0) AS qty,
                  COALESCE(SUM(oi.line_total), 0) AS total
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.status = ANY($2::text[])
             AND COALESCE(o.ordered_at, o.created_at) >= ${dayStart}
             AND COALESCE(o.ordered_at, o.created_at) < ${dayEnd}
           GROUP BY 1`,
          [dayStr, soldList]
        ),
        fieldQueryTiered(
          `SELECT COALESCE(NULLIF(wi.product_name, ''), 'Mahsulot') AS name,
                  COALESCE(SUM(wi.quantity), 0) AS qty,
                  COALESCE(SUM(wi.subtotal), 0) AS total
           FROM waybill_items wi
           JOIN waybills w ON w.id = wi.waybill_id
           WHERE (w.stock_posted = true OR w.reys_id IS NOT NULL)
             AND COALESCE(w.sale_date, (w.created_at AT TIME ZONE '${TZ}')::date) >= ($1::date - interval '6 days')
             AND COALESCE(w.sale_date, (w.created_at AT TIME ZONE '${TZ}')::date) <= $1::date
           GROUP BY 1`,
          `SELECT COALESCE(NULLIF(wi.product_name, ''), 'Mahsulot') AS name,
                  COALESCE(SUM(wi.quantity), 0) AS qty,
                  COALESCE(SUM(wi.subtotal), 0) AS total
           FROM waybill_items wi
           JOIN waybills w ON w.id = wi.waybill_id
           WHERE w.stock_posted = true
             AND w.created_at >= ${dayStart}
             AND w.created_at < ${dayEnd}
           GROUP BY 1`,
          [dayStr],
          null
        )
      ]);

      const ordersMap = sumBySana(orderDays.rows);
      const expenseMap = sumBySana(expenseDays.rows);
      const cashMap = sumBySana(cashDays.rows);
      const fieldMap = sumBySana(fieldDays.rows);
      const kunlar = [];
      for (let i = 6; i >= 0; i--) {
        const sana = shiftIso(dayStr, -i);
        const savdo = som((ordersMap[sana] || 0) + (fieldMap[sana] || 0));
        const xarajat = som(expenseMap[sana] || 0);
        kunlar.push({
          sana: sana,
          savdo: savdo,
          xarajat: xarajat,
          foyda: som(savdo - xarajat),
          naqd: som(cashMap[sana] || 0)
        });
      }
      const kecha = kunlar.length > 1 ? kunlar[kunlar.length - 2] : { savdo: 0, xarajat: 0, foyda: 0, naqd: 0 };
      const prevFieldSum = som(prevField.rows[0] && prevField.rows[0].total);
      const prevSavdo = som(prevOrders.rows[0].total) + prevFieldSum;
      const prevXarajat = som(prevExpenses.rows[0].total);
      return {
        kunlar: kunlar,
        top_mahsulot: mergeTopProducts(topOrders.rows, topField.rows),
        kecha_savdo: kecha.savdo,
        kecha_xarajat: kecha.xarajat,
        kecha_foyda: kecha.foyda,
        kecha_naqd: kecha.naqd,
        oldingi_oy_savdo: prevSavdo,
        oldingi_oy_xarajat: prevXarajat,
        oldingi_oy_foyda: som(prevSavdo - prevXarajat),
        oldingi_oy_naqd: som(prevCash.rows[0].total)
      };
    } catch (err) {
      console.error('dashboard trends', err && err.message);
      return blank;
    }
  }

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
      const trendsP = loadDashboardTrends(dayStr);

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
        fieldToday,
        fieldMonth,
        fieldDebt,
        recentField,
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
        querySkuStock(),
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
        fieldQueryTiered(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM waybills
           WHERE (stock_posted = true OR reys_id IS NOT NULL)
             AND created_at >= ($1::timestamp AT TIME ZONE '${TZ}')
             AND created_at < ($1::timestamp AT TIME ZONE '${TZ}') + interval '1 day'`,
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM waybills
           WHERE stock_posted = true
             AND created_at >= ($1::timestamp AT TIME ZONE '${TZ}')
             AND created_at < ($1::timestamp AT TIME ZONE '${TZ}') + interval '1 day'`,
          [dayStr],
          { total: 0 }
        ),
        fieldQueryTiered(
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM waybills
           WHERE (stock_posted = true OR reys_id IS NOT NULL)
             AND created_at >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')
             AND created_at < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`,
          `SELECT COALESCE(SUM(total_amount),0) AS total FROM waybills
           WHERE stock_posted = true
             AND created_at >= (date_trunc('month', $1::date)::timestamp AT TIME ZONE '${TZ}')
             AND created_at < ((date_trunc('month', $1::date) + interval '1 month')::timestamp AT TIME ZONE '${TZ}')`,
          [dayStr],
          { total: 0 }
        ),
        fieldQuery(
          `SELECT COALESCE(SUM(debt_amount),0) AS total FROM waybills WHERE debt_amount > 0`,
          [],
          { total: 0 }
        ),
        fieldQueryTiered(
          `SELECT w.id, w.waybill_code, c.name AS customer_name, w.total_amount, w.paid_amount,
                  w.debt_amount, w.status, w.created_at
           FROM waybills w
           LEFT JOIN customers c ON c.id = w.customer_id
           WHERE (w.stock_posted = true OR w.reys_id IS NOT NULL)
           ORDER BY w.id DESC LIMIT 8`,
          `SELECT w.id, w.waybill_code, c.name AS customer_name, w.total_amount, w.paid_amount,
                  w.debt_amount, w.status, w.created_at
           FROM waybills w
           LEFT JOIN customers c ON c.id = w.customer_id
           WHERE w.stock_posted = true
           ORDER BY w.id DESC LIMIT 8`,
          [],
          null
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
      const fieldTodaySum = som(fieldToday.rows[0] && fieldToday.rows[0].total);
      const fieldMonthSum = som(fieldMonth.rows[0] && fieldMonth.rows[0].total);
      const jamiQarz = som(debt.rows[0].total) + som(fieldDebt.rows[0] && fieldDebt.rows[0].total);
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

      const trends = await trendsP;

      res.json({
        ok: true,
        data: {
          timezone: TZ,
          business_date: dayStr,
          bugungi_savdo: som(salesToday.rows[0].total) + fieldTodaySum,
          yuk_tarqatish_bugun: fieldTodaySum,
          bugungi_xarajat: som(expenseToday.rows[0].total),
          bugungi_foyda: som(salesToday.rows[0].total) + fieldTodaySum - som(expenseToday.rows[0].total),
          bugungi_naqd_tushum: som(cashToday.rows[0].total),
          bugungi_qadoq_kg: packTodayKg,
          bugungi_qadoq_qty: num(packToday.rows[0].qty),
          oylik_savdo: som(salesMonth.rows[0].total) + fieldMonthSum,
          yuk_tarqatish_oy: fieldMonthSum,
          oylik_xarajat: som(expenseMonth.rows[0].total),
          oylik_foyda: som(salesMonth.rows[0].total) + fieldMonthSum - som(expenseMonth.rows[0].total),
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
          recent_field_sales: recentField.rows,
          alerts,
          kunlar: trends.kunlar,
          top_mahsulot: trends.top_mahsulot,
          kecha_savdo: trends.kecha_savdo,
          kecha_xarajat: trends.kecha_xarajat,
          kecha_foyda: trends.kecha_foyda,
          kecha_naqd: trends.kecha_naqd,
          oldingi_oy_savdo: trends.oldingi_oy_savdo,
          oldingi_oy_xarajat: trends.oldingi_oy_xarajat,
          oldingi_oy_foyda: trends.oldingi_oy_foyda,
          oldingi_oy_naqd: trends.oldingi_oy_naqd,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  });
};
