#!/usr/bin/env node
/**
 * briket-mini-app -> Briket ERP import.
 *
 * Sukut bo'yicha DRY-RUN: hech narsa yozilmaydi.
 *   node scripts/import-mini-app.js
 *   node scripts/import-mini-app.js --apply
 *   node scripts/import-mini-app.js --apply --links links.json
 *
 * Env:
 *   MINI_DATABASE_URL  mini-app Postgres (faqat o'qiladi)
 *   DATABASE_URL       ERP Postgres (--apply da yoziladi; dry-run da dublikat tekshiruvi)
 *
 * Dublikat mijozlar avtomatik birlashtirilmaydi.
 * --links fayl: { "stores": { "<legacy uuid>": <erp customer id> }, "products": { "<legacy uuid>": <erp product id> } }
 *
 * Bu skript o'zi ishga tushirilmaydi. Productionga qo'lda, ko'rib chiqqandan keyin.
 */
const fs = require('fs');
const { Pool } = require('pg');
const {
  LEGACY_SOURCE,
  buildImportPlan,
} = require('../lib/import-match');

function poolFor(url) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 10000,
  });
}

function printPlan(plan, log) {
  const out = log || console.log;
  out('--- Dublikat nomzodlar (avtomatik birlashtirilmaydi) ---');
  if (!plan.duplicates.length) out("Dublikat topilmadi.");
  plan.duplicates.forEach(function (d) {
    if (d.kind === 'erp') {
      out(
        'ERP  do\'kon ' + d.store_id + ' «' + d.store_name + '» ' + (d.store_phone || '-') +
        '  ~  mijoz #' + d.customer_id + ' «' + d.customer_name + '» ' + (d.customer_phone || '-') +
        '  [' + d.reason + ']'
      );
    } else {
      out(
        'MINI do\'kon ' + d.store_id + ' «' + d.store_name + '» ~ do\'kon ' +
        d.other_store_id + ' «' + d.other_store_name + '» [' + d.reason + ']'
      );
    }
  });
  out('--- Qarz solishtirish (har bir do\'kon) ---');
  plan.debts.forEach(function (d) {
    const mark = d.needs_review ? 'FARQ' : 'ok';
    out(
      mark +
        '\t' + d.store_id +
        '\t' + (d.store_name || '') +
        '\tsaqlandi=' + d.stored_debt +
        '\tjami-tolangan=' + d.reconstructed_unpaid +
        '\ttolovlar=' + d.payments_sum +
        '\tsaqlandi-(jami-tolangan)=' + d.stored_minus_reconstructed +
        '\t' + d.interpretation
    );
  });
  if (plan.product_unmatched.length) {
    out('--- ERP katalogiga tushmagan mini mahsulotlar ---');
    plan.product_unmatched.forEach(function (p) {
      out(p.legacy_id + '\t' + p.name + '\tmos=' + (p.matches.length ? p.matches.join(',') : 'yo\'q'));
    });
  }
  out(
    'Jami: agent ' + plan.counts.profiles +
    ', do\'kon ' + plan.counts.stores +
    ', dublikat juft ' + plan.counts.duplicate_pairs +
    ', qarz farqi ' + plan.counts.debt_reviews +
    ', o\'tkazib yuboriladigan do\'kon ' + plan.counts.skipped_stores +
    ', mos kelmagan mahsulot ' + plan.counts.unmatched_products
  );
  out('Tasdiqlangan bog\'lash: --links {"stores":{"<uuid>":<customer_id>},"products":{"<uuid>":<product_id>}}');
  out('Egalik: mijoz va yuk xati adminniki (agent_id bo\'sh). Tarixiy qatorlar ERP buyurtmasi va ombor qoldig\'iga yozilmaydi.');
}

async function findLegacy(erp, table, legacyId) {
  const sql = {
    agents: 'SELECT id FROM agents WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    agent_access_requests:
      'SELECT id FROM agent_access_requests WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    customers: 'SELECT id FROM customers WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    waybills: 'SELECT id FROM waybills WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    waybill_items: 'SELECT id FROM waybill_items WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    agent_debt_payments:
      'SELECT id FROM agent_debt_payments WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    agent_commission_events:
      'SELECT id FROM agent_commission_events WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    agent_commission_withdrawals:
      'SELECT id FROM agent_commission_withdrawals WHERE legacy_source = $1 AND legacy_id = $2 LIMIT 1',
    customer_map:
      'SELECT id FROM customer_map WHERE legacy_source = $1 AND legacy_uuid = $2 LIMIT 1',
    product_map:
      'SELECT id FROM product_map WHERE legacy_source = $1 AND legacy_uuid = $2 LIMIT 1',
  }[table];
  if (!sql) throw new Error('noma\'lum jadval');
  const r = await erp.query(sql, [LEGACY_SOURCE, String(legacyId)]);
  return r.rows[0] || null;
}

async function applyImport(erp, mini, plan) {
  const summary = { inserted: 0, skipped: 0 };
  const agentIds = {};
  const customerIds = {};
  const waybillIds = {};
  const paymentIds = {};
  const productIds = {};

  function skip() {
    summary.skipped += 1;
  }
  function inserted() {
    summary.inserted += 1;
  }

  for (const profile of mini.profiles || []) {
    const legacyId = String(profile.id);
    let row = await findLegacy(erp, 'agents', legacyId);
    if (!row && profile.telegram_id != null) {
      const byTg = await erp.query('SELECT id, legacy_id FROM agents WHERE telegram_id = $1 LIMIT 1', [
        profile.telegram_id,
      ]);
      row = byTg.rows[0] || null;
      if (row && !row.legacy_id) {
        await erp.query(
          `UPDATE agents SET
             legacy_source = COALESCE(legacy_source, $1),
             legacy_id = COALESCE(legacy_id, $2),
             email = COALESCE(email, $3),
             telegram_username = COALESCE(telegram_username, $4),
             full_name = CASE WHEN full_name IS NULL OR full_name = '' THEN $5 ELSE full_name END,
             commission_enabled_on = COALESCE(commission_enabled_on, $6)
           WHERE id = $7 AND (legacy_id IS NULL OR legacy_id = $2)`,
          [
            LEGACY_SOURCE,
            legacyId,
            profile.email || null,
            profile.telegram_username || null,
            profile.full_name || '',
            profile.commission_enabled_on || null,
            row.id,
          ]
        );
      }
    }
    if (!row) {
      const ins = await erp.query(
        `INSERT INTO agents
           (telegram_id, telegram_username, full_name, email, role, access_status,
            commission_enabled_on, is_active, legacy_source, legacy_id)
         VALUES ($1,$2,$3,$4,'agent',$5,$6,true,$7,$8)
         RETURNING id`,
        [
          profile.telegram_id || null,
          profile.telegram_username || null,
          profile.full_name || '',
          profile.email || null,
          profile.access_status || 'pending',
          profile.commission_enabled_on || null,
          LEGACY_SOURCE,
          legacyId,
        ]
      );
      row = ins.rows[0];
      inserted();
    } else skip();
    agentIds[legacyId] = row.id;
  }

  for (const reqRow of mini.access_requests || []) {
    const legacyId = String(reqRow.id);
    const existing = await findLegacy(erp, 'agent_access_requests', legacyId);
    if (existing) {
      skip();
      continue;
    }
    await erp.query(
      `INSERT INTO agent_access_requests
         (telegram_id, telegram_username, full_name, status, notify_message_id,
          decided_at, decided_by, legacy_source, legacy_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, NOW()))`,
      [
        reqRow.telegram_id,
        reqRow.telegram_username || null,
        reqRow.full_name || null,
        reqRow.status || 'pending',
        reqRow.notify_message_id || null,
        reqRow.decided_at || null,
        reqRow.decided_by == null ? null : String(reqRow.decided_by),
        LEGACY_SOURCE,
        legacyId,
        reqRow.created_at || null,
      ]
    );
    inserted();
  }

  const debtByStore = {};
  (plan.debts || []).forEach(function (d) {
    debtByStore[String(d.store_id)] = d;
  });
  const skippedStores = {};
  (plan.actions || []).forEach(function (a) {
    if (a.type === 'skip_customer') skippedStores[a.store_id] = true;
  });

  for (const store of mini.stores || []) {
    const legacyId = String(store.id);
    if (skippedStores[legacyId]) {
      skip();
      continue;
    }
    let customerId = null;
    const link = (plan.actions || []).find((a) => a.type === 'link_customer' && a.store_id === legacyId);
    if (link) {
      const cur = await erp.query(
        'SELECT id, agent_id, legacy_id FROM customers WHERE id = $1',
        [link.customer_id]
      );
      if (!cur.rows.length) {
        skip();
        continue;
      }
      const row = cur.rows[0];
      if (row.legacy_id && String(row.legacy_id) !== legacyId) {
        skip();
        continue;
      }
      await erp.query(
        `UPDATE customers SET
           latitude = COALESCE(latitude, $2),
           longitude = COALESCE(longitude, $3),
           legacy_source = COALESCE(legacy_source, $4),
           legacy_id = COALESCE(legacy_id, $5)
         WHERE id = $1`,
        [row.id, store.latitude, store.longitude, LEGACY_SOURCE, legacyId]
      );
      customerId = row.id;
    } else {
      const existing = await findLegacy(erp, 'customers', legacyId);
      if (existing) {
        customerId = existing.id;
        skip();
      } else {
        const ins = await erp.query(
          `INSERT INTO customers
             (name, phone, address, latitude, longitude, agent_id, is_active, note, legacy_source, legacy_id)
           VALUES ($1,$2,$3,$4,$5,NULL,true,$6,$7,$8)
           RETURNING id`,
          [
            store.name || 'Do\'kon',
            store.phone || null,
            store.address || null,
            store.latitude != null ? store.latitude : null,
            store.longitude != null ? store.longitude : null,
            'Mini-app do\'koni',
            LEGACY_SOURCE,
            legacyId,
          ]
        );
        customerId = ins.rows[0].id;
        inserted();
      }
    }
    customerIds[legacyId] = customerId;
    const mapped = await findLegacy(erp, 'customer_map', legacyId);
    if (!mapped && customerId) {
      await erp.query(
        `INSERT INTO customer_map (legacy_uuid, customer_id, agent_id, legacy_source)
         VALUES ($1,$2,NULL,$3)`,
        [legacyId, customerId, LEGACY_SOURCE]
      );
      inserted();
    }
  }

  for (const action of plan.actions || []) {
    if (action.type !== 'link_product') continue;
    const existing = await findLegacy(erp, 'product_map', action.legacy_id);
    if (existing) {
      skip();
      continue;
    }
    await erp.query(
      `INSERT INTO product_map (legacy_uuid, product_id, agent_id, legacy_source)
       VALUES ($1,$2,NULL,$3)`,
      [String(action.legacy_id), action.product_id, LEGACY_SOURCE]
    );
    productIds[String(action.legacy_id)] = action.product_id;
    inserted();
  }

  function productIdForName(ownerId, name) {
    const miniProduct = (mini.products || []).find(
      (p) => String(p.owner_id) === String(ownerId) && String(p.name || '') === String(name || '')
    );
    if (!miniProduct) return null;
    return productIds[String(miniProduct.id)] || null;
  }

  for (const order of mini.orders || []) {
    const legacyId = String(order.id);
    const storeId = String(order.store_id);
    if (skippedStores[storeId] || !customerIds[storeId]) {
      skip();
      continue;
    }
    let waybillId = null;
    const existing = await findLegacy(erp, 'waybills', legacyId);
    if (existing) {
      waybillId = existing.id;
      skip();
    } else {
      const ins = await erp.query(
        `INSERT INTO waybills
           (waybill_code, agent_id, customer_id, total_amount, paid_amount, debt_amount,
            commission_amount, due_date, status, note, legacy_source, legacy_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13, NOW()))
         RETURNING id`,
        [
          'YX-LEG-' + legacyId,
          null,
          customerIds[storeId],
          order.total_amount || 0,
          order.paid_amount || 0,
          order.debt_amount || 0,
          0,
          order.due_date || null,
          Number(order.debt_amount) > 0 ? (Number(order.paid_amount) > 0 ? 'partial' : 'open') : 'paid',
          null,
          LEGACY_SOURCE,
          legacyId,
          order.created_at || null,
        ]
      );
      waybillId = ins.rows[0].id;
      inserted();
    }
    waybillIds[legacyId] = waybillId;
    const items = (mini.order_items || []).filter((it) => String(it.order_id) === legacyId);
    let commissionSum = 0;
    for (const it of items) {
      commissionSum += Number(it.commission) || 0;
      const itemLegacy = String(it.id);
      if (await findLegacy(erp, 'waybill_items', itemLegacy)) {
        skip();
        continue;
      }
      await erp.query(
        `INSERT INTO waybill_items
           (waybill_id, product_id, product_name, quantity, price, subtotal, commission, legacy_source, legacy_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          waybillId,
          productIdForName(order.owner_id, it.product_name),
          it.product_name || '',
          it.quantity || 0,
          it.price || 0,
          it.subtotal || 0,
          it.commission || 0,
          LEGACY_SOURCE,
          itemLegacy,
        ]
      );
      inserted();
    }
    if (!existing && waybillId) {
      await erp.query(
        `UPDATE waybills SET commission_amount = $1 WHERE id = $2 AND legacy_source = $3 AND legacy_id = $4`,
        [commissionSum, waybillId, LEGACY_SOURCE, legacyId]
      );
    }
  }

  for (const pay of mini.debt_payments || []) {
    const legacyId = String(pay.id);
    const storeId = String(pay.store_id);
    if (skippedStores[storeId] || !customerIds[storeId]) {
      skip();
      continue;
    }
    const existing = await findLegacy(erp, 'agent_debt_payments', legacyId);
    if (existing) {
      paymentIds[legacyId] = existing.id;
      skip();
      continue;
    }
    const debt = debtByStore[storeId];
    const applied = debt ? debt.applied_to_waybills === true : false;
    const ins = await erp.query(
      `INSERT INTO agent_debt_payments
         (agent_id, customer_id, amount, notes, applied_to_waybills, legacy_source, legacy_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, NOW()))
       RETURNING id`,
      [
        null,
        customerIds[storeId],
        pay.amount || 0,
        pay.notes || null,
        applied,
        LEGACY_SOURCE,
        legacyId,
        pay.created_at || null,
      ]
    );
    paymentIds[legacyId] = ins.rows[0].id;
    inserted();
  }

  for (const ev of mini.commission_events || []) {
    const legacyId = String(ev.id);
    const storeId = ev.store_id == null ? '' : String(ev.store_id);
    if (!agentIds[String(ev.owner_id)] || (storeId && (skippedStores[storeId] || !customerIds[storeId]))) {
      skip();
      continue;
    }
    if (await findLegacy(erp, 'agent_commission_events', legacyId)) {
      skip();
      continue;
    }
    const paymentLegacy = ev.debt_payment_id == null ? '' : String(ev.debt_payment_id);
    const orderLegacy = ev.order_id == null ? '' : String(ev.order_id);
    await erp.query(
      `INSERT INTO agent_commission_events
         (agent_id, customer_id, waybill_id, debt_payment_id, amount, source, legacy_source, legacy_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, NOW()))`,
      [
        agentIds[String(ev.owner_id)] || null,
        storeId ? customerIds[storeId] : null,
        orderLegacy ? waybillIds[orderLegacy] || null : null,
        paymentLegacy ? paymentIds[paymentLegacy] || null : null,
        ev.amount || 0,
        ev.source || 'import',
        LEGACY_SOURCE,
        legacyId,
        ev.created_at || null,
      ]
    );
    inserted();
  }

  for (const wd of mini.commission_withdrawals || []) {
    const legacyId = String(wd.id);
    if (!agentIds[String(wd.owner_id)]) {
      skip();
      continue;
    }
    if (await findLegacy(erp, 'agent_commission_withdrawals', legacyId)) {
      skip();
      continue;
    }
    await erp.query(
      `INSERT INTO agent_commission_withdrawals
         (agent_id, amount, notes, legacy_source, legacy_id, created_at)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6, NOW()))`,
      [
        agentIds[String(wd.owner_id)] || null,
        wd.amount || 0,
        wd.notes || null,
        LEGACY_SOURCE,
        legacyId,
        wd.created_at || null,
      ]
    );
    inserted();
  }

  return summary;
}

async function runImport(opts) {
  const log = opts.log || console.log;
  const plan = buildImportPlan(opts.mini, opts.erp, opts.links);
  log(opts.apply ? 'APPLY — ERP ga yoziladi' : 'DRY-RUN — hech narsa yozilmaydi');
  printPlan(plan, log);
  if (!opts.apply) return { plan: plan, wrote: false };
  if (!opts.erpClient) throw new Error('erp client kerak');
  await opts.erpClient.query('BEGIN');
  try {
    const summary = await applyImport(opts.erpClient, opts.mini, plan);
    await opts.erpClient.query('COMMIT');
    log('Yozildi: ' + summary.inserted + ', o\'tkazildi: ' + summary.skipped);
    return { plan: plan, wrote: true, summary: summary };
  } catch (err) {
    try {
      await opts.erpClient.query('ROLLBACK');
    } catch (e) {}
    throw err;
  }
}

async function readMini(client) {
  await client.query('SET default_transaction_read_only = on');
  async function all(sql) {
    const r = await client.query(sql);
    return r.rows;
  }
  return {
    profiles: await all(
      'SELECT id, telegram_id, telegram_username, full_name, created_at, commission_enabled_on, access_status, email FROM profiles'
    ),
    access_requests: await all(
      'SELECT id, telegram_id, telegram_username, full_name, status, notify_message_id, created_at, decided_at, decided_by FROM access_requests'
    ),
    stores: await all(
      'SELECT id, owner_id, name, phone, address, created_at, latitude, longitude FROM stores'
    ),
    products: await all(
      'SELECT id, owner_id, name, default_price, default_commission, created_at FROM products'
    ),
    orders: await all(
      'SELECT id, owner_id, store_id, total_amount, paid_amount, debt_amount, due_date, created_at FROM orders'
    ),
    order_items: await all(
      'SELECT id, order_id, product_name, quantity, price, subtotal, commission FROM order_items'
    ),
    debt_payments: await all(
      'SELECT id, owner_id, store_id, amount, notes, created_at FROM debt_payments'
    ),
    commission_events: await all(
      'SELECT id, owner_id, store_id, order_id, amount, source, debt_payment_id, created_at FROM commission_events'
    ),
    commission_withdrawals: await all(
      'SELECT id, owner_id, amount, notes, created_at FROM commission_withdrawals'
    ),
  };
}

async function readErp(client) {
  await client.query('SET default_transaction_read_only = on');
  const customers = await client.query('SELECT id, name, phone, legacy_id, agent_id FROM customers');
  const products = await client.query('SELECT id, sku FROM products');
  return { customers: customers.rows, products: products.rows };
}

function loadLinks(argv) {
  const idx = argv.indexOf('--links');
  if (idx === -1) return {};
  const file = argv[idx + 1];
  if (!file) throw new Error('--links fayl yo\'li kerak');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function main() {
  const apply = process.argv.indexOf('--apply') !== -1;
  const miniUrl = (process.env.MINI_DATABASE_URL || '').trim();
  const erpUrl = (process.env.DATABASE_URL || '').trim();
  if (!miniUrl) {
    console.error('MINI_DATABASE_URL kerak');
    process.exit(1);
  }
  if (apply && !erpUrl) {
    console.error('--apply uchun DATABASE_URL kerak');
    process.exit(1);
  }
  if (apply && miniUrl === erpUrl) {
    console.error('MINI_DATABASE_URL va DATABASE_URL bir xil bo\'lmasin');
    process.exit(1);
  }
  const links = loadLinks(process.argv);
  const miniPool = poolFor(miniUrl);
  const erpPool = erpUrl ? poolFor(erpUrl) : null;
  try {
    const mini = await readMini(miniPool);
    let erp = { customers: [], products: [] };
    if (erpPool && !apply) {
      erp = await readErp(erpPool);
    } else if (erpPool && apply) {
      const snap = await erpPool.connect();
      try {
        await snap.query('SET default_transaction_read_only = on');
        const customers = await snap.query('SELECT id, name, phone, legacy_id, agent_id FROM customers');
        const products = await snap.query('SELECT id, sku FROM products');
        erp = { customers: customers.rows, products: products.rows };
        await snap.query('SET default_transaction_read_only = off');
        await runImport({ apply: true, mini: mini, erp: erp, links: links, erpClient: snap });
      } finally {
        snap.release();
      }
      return;
    }
    await runImport({ apply: false, mini: mini, erp: erp, links: links });
  } finally {
    await miniPool.end();
    if (erpPool) await erpPool.end();
  }
}

if (require.main === module) {
  main().catch(function (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  runImport: runImport,
  applyImport: applyImport,
  printPlan: printPlan,
  readMini: readMini,
};
