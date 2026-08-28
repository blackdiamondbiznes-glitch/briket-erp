module.exports = function(app, pool, helpers) {
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
  } catch (err) { sendError(res, err); }
});

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
        WHERE o.status NOT IN ('cancelled', 'rejected')
        GROUP BY oi.product_id
      ) sold ON sold.product_id = p.id
      WHERE p.is_active = true
      ORDER BY p.sku
    `);
    res.json({ ok: true, count: r.rows.length, data: r.rows });
  } catch (err) { sendError(res, err); }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sales = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE ordered_at::date = $1 AND status NOT IN ('cancelled','rejected')`, [today]);
    const expense = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE expense_date::date = $1`, [today]);
    const debt = await pool.query(`SELECT COALESCE(SUM(debt_amount),0) AS total FROM orders WHERE debt_amount > 0`);
    const activeBatches = await pool.query(`SELECT COUNT(*)::int AS cnt, COALESCE(SUM(remaining_kg),0) AS kg FROM batches WHERE status = 'active'`);
    const products = await pool.query(`SELECT COUNT(*)::int AS cnt FROM products WHERE is_active = true`);
    res.json({
      ok: true,
      data: {
        bugungi_savdo: num(sales.rows[0].total),
        bugungi_xarajat: num(expense.rows[0].total),
        jami_qarz: num(debt.rows[0].total),
        faol_partiya: activeBatches.rows[0].cnt,
        quruq_qoldiq_kg: num(activeBatches.rows[0].kg),
        faol_sku: products.rows[0].cnt
      }
    });
  } catch (err) { sendError(res, err); }
});

};
