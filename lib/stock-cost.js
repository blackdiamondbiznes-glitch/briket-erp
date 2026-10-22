/**
 * Tayyor mahsulot tannarxi va foydasi.
 * tannarx = bir dona xarajat (qo'lda cost_price > 0, aks holda retsept/avto).
 * foyda = sotish narxi − tannarx. Jami = shu qiymat × qoldiq.
 */
function num(v, def) {
  if (def === undefined) def = 0;
  const n = Number(v);
  return isNaN(n) ? def : n;
}

function som(v, def) {
  return Math.round(num(v, def));
}

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

async function loadCostContext(pool) {
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
  const parts = { komir: 0, reka: 0, parafin: 0, paket: 0, wage: packWage, recipe: 0 };

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
      function (n) { return n.indexOf("ko'mir") !== -1 || n.indexOf('komir') !== -1 || n.indexOf("ko‘mir") !== -1; },
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

/**
 * Bir qatorning ko'rsatiladigan puli.
 * unitCost / costValue = tannarx. margin / potentialProfit = foyda.
 * Ikkalasi almashtirilmaydi: foyda = sotish − tannarx.
 */
function figures(price, unitCost, qty) {
  const sale = som(price);
  const cost = som(unitCost);
  const q = num(qty);
  const profit = som(sale - cost);
  return {
    sell_price: sale,
    price: sale,
    unitCost: cost,
    margin: profit,
    profit_unit: profit,
    value: som(q * sale),
    costValue: som(q * cost),
    cost_value: som(q * cost),
    potentialProfit: som(q * profit),
    profit_value: som(q * profit)
  };
}

function attachProductCost(row, ctx) {
  const c = unitCostFor(row, ctx);
  const figs = figures(row.price, c.unit_cost, 1);
  return Object.assign({}, row, {
    unit_cost: figs.unitCost,
    profit_unit: figs.margin,
    cost_computed: c.cost_computed,
    cost_override: c.cost_override
  });
}

module.exports = {
  num: num,
  som: som,
  loadCostContext: loadCostContext,
  unitCostFor: unitCostFor,
  figures: figures,
  attachProductCost: attachProductCost
};
