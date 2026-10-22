#!/usr/bin/env node
/**
 * ERP dagi sinov qarzini ko'rsatadi. Sukut bo'yicha DRY-RUN: hech narsa yozilmaydi.
 *
 *   node scripts/cleanup-test-data.js
 *   node scripts/cleanup-test-data.js --apply --ids ids.json
 *
 * ids.json ni egasi o'zi tasdiqlaydi. Namuna:
 *   { "orders": [1], "payments": [2], "shipments": [3], "waybills": [4] }
 *
 * --apply nusxani archived_rows ga qo'yadi, keyin shu idlarni bitta tranzaksiyada o'chiradi.
 * Mijozlar o'chirilmaydi. Faylsiz --apply ishlamaydi.
 * Productionga qo'lda, ko'rib chiqqandan keyin. Bu skript o'zi ishga tushirilmaydi.
 */
const fs = require('fs');
const { Pool } = require('pg');

const TABLES = ['orders', 'payments', 'shipments', 'waybills'];

function poolFor(url) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 10000,
  });
}

function missingTable(err) {
  return err && (err.code === '42P01' || err.code === '42703');
}

function parseIds(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('--ids JSON obyekt bo\'lishi kerak');
  }
  Object.keys(raw).forEach(function (key) {
    if (TABLES.indexOf(key) === -1) throw new Error('noma\'lum kalit: ' + key);
  });
  const out = { orders: [], payments: [], shipments: [], waybills: [] };
  TABLES.forEach(function (table) {
    const list = raw[table] || [];
    if (!Array.isArray(list)) throw new Error(table + ' ro\'yxat bo\'lishi kerak');
    const seen = {};
    list.forEach(function (id) {
      if (!/^\d+$/.test(String(id))) throw new Error('id butun son bo\'lishi kerak: ' + id);
      if (seen[String(id)]) throw new Error('takroriy id: ' + table + ' ' + id);
      seen[String(id)] = true;
      out[table].push(Number(id));
    });
  });
  const total = TABLES.reduce(function (s, table) { return s + out[table].length; }, 0);
  if (!total) throw new Error('--ids bo\'sh');
  return out;
}

function loadIds(argv) {
  const idx = argv.indexOf('--ids');
  if (idx === -1) return null;
  const file = argv[idx + 1];
  if (!file) throw new Error('--ids fayl yo\'li kerak');
  return parseIds(JSON.parse(fs.readFileSync(file, 'utf8')));
}

async function optionalRows(client, sql, params) {
  try {
    const r = await client.query(sql, params || []);
    return r.rows;
  } catch (err) {
    if (missingTable(err)) return null;
    throw err;
  }
}

async function listCandidates(client) {
  const orders = (await client.query(
    `SELECT id, order_code, customer_id, customer_name, status, total_amount, paid_amount, debt_amount, source, created_at
     FROM orders ORDER BY id`
  )).rows;
  const payments = (await client.query(
    `SELECT id, order_id, customer_id, amount, method, note, paid_at
     FROM payments ORDER BY id`
  )).rows;
  const shipments = (await client.query(
    `SELECT id, shipment_code, from_type, to_partner_id, product_id, sku, qty, returned_qty, status, total_amount
     FROM shipments ORDER BY id`
  )).rows;
  const waybills = await optionalRows(
    client,
    `SELECT id, waybill_code, customer_id, total_amount, paid_amount, debt_amount, stock_posted, reys_id
     FROM waybills ORDER BY id`
  );
  const customers = (await client.query(
    `SELECT c.id, c.name, c.phone,
       COALESCE((SELECT SUM(o.debt_amount) FROM orders o WHERE o.customer_id = c.id AND o.debt_amount > 0), 0) AS order_debt
     FROM customers c
     ORDER BY c.id`
  )).rows;
  let waybillDebt = null;
  if (waybills) {
    waybillDebt = await optionalRows(
      client,
      `SELECT customer_id, COALESCE(SUM(debt_amount), 0) AS debt
       FROM waybills WHERE debt_amount > 0 GROUP BY customer_id`
    );
  }
  return {
    orders: orders,
    payments: payments,
    shipments: shipments,
    waybills: waybills,
    customers: customers,
    waybillDebt: waybillDebt,
  };
}

function debtByCustomer(listing) {
  const map = {};
  (listing.waybillDebt || []).forEach(function (row) {
    map[String(row.customer_id)] = Number(row.debt) || 0;
  });
  return (listing.customers || []).map(function (c) {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      order_debt: Number(c.order_debt) || 0,
      waybill_debt: map[String(c.id)] || 0,
    };
  }).filter(function (c) { return c.order_debt > 0 || c.waybill_debt > 0; });
}

function suggestedIds(listing) {
  return {
    orders: (listing.orders || []).map(function (r) { return Number(r.id); }),
    payments: (listing.payments || []).map(function (r) { return Number(r.id); }),
    shipments: (listing.shipments || []).map(function (r) { return Number(r.id); }),
    waybills: (listing.waybills || []).map(function (r) { return Number(r.id); }),
  };
}

function printListing(listing, log) {
  const out = log || console.log;
  out('DRY-RUN — hech narsa yozilmaydi. Mijozlar o\'chirilmaydi.');
  out('--- Mijoz qarzi (mijoz o\'zi qoladi) ---');
  const debts = debtByCustomer(listing);
  if (!debts.length) out('Qarzdor mijoz yo\'q.');
  debts.forEach(function (c) {
    out('#' + c.id + '\t' + (c.name || '') + '\tbuyurtma=' + c.order_debt + '\tyuk_xati=' + c.waybill_debt);
  });
  out('--- Buyurtmalar ---');
  (listing.orders || []).forEach(function (o) {
    out('#' + o.id + '\t' + (o.order_code || '') + '\t' + (o.customer_name || '') + '\tqarz=' + o.debt_amount + '\tholat=' + o.status);
  });
  if (!(listing.orders || []).length) out('Buyurtma yo\'q.');
  out('--- To\'lovlar ---');
  (listing.payments || []).forEach(function (p) {
    out('#' + p.id + '\tbuyurtma=' + (p.order_id == null ? '-' : '#' + p.order_id) + '\t' + p.amount + '\t' + (p.method || ''));
  });
  if (!(listing.payments || []).length) out('To\'lov yo\'q.');
  out('--- Jo\'natmalar ---');
  (listing.shipments || []).forEach(function (s) {
    out('#' + s.id + '\t' + (s.shipment_code || '') + '\t' + (s.sku || '') + '\t' + s.qty + '\t' + s.status);
  });
  if (!(listing.shipments || []).length) out('Jo\'natma yo\'q.');
  out('--- Yuk xatilar ---');
  if (listing.waybills == null) out('waybills jadvali yo\'q.');
  else {
    listing.waybills.forEach(function (w) {
      out('#' + w.id + '\t' + (w.waybill_code || '') + '\tqarz=' + w.debt_amount + '\tstock_posted=' + w.stock_posted);
    });
    if (!listing.waybills.length) out('Yuk xati yo\'q.');
  }
  out('--- Tasdiq fayli. Keraksiz idlarni o\'chiring, keyin --apply --ids ---');
  out(JSON.stringify(suggestedIds(listing)));
  out('Arxiv: avval archived_rows ga nusxa, keyin o\'chirish, bitta tranzaksiya. migrations/006 kerak.');
}

async function lockRows(client, table, ids, cast) {
  if (!ids.length) return [];
  const r = await client.query(
    'SELECT * FROM ' + table + ' WHERE id = ANY($1::' + cast + ') FOR UPDATE',
    [ids]
  );
  if (r.rows.length !== ids.length) {
    const have = {};
    r.rows.forEach(function (row) { have[String(row.id)] = true; });
    const missing = ids.filter(function (id) { return !have[String(id)]; });
    throw new Error(table + ' topilmadi: ' + missing.join(','));
  }
  return r.rows;
}

async function childRows(client, sql, params) {
  try {
    const r = await client.query(sql, params);
    return r.rows;
  } catch (err) {
    if (missingTable(err)) return [];
    throw err;
  }
}

async function archiveCopy(client, batch, table, rows) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    await client.query(
      `INSERT INTO archived_rows (batch_key, source_table, source_id, row_data)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [batch, table, String(row.id), JSON.stringify(row)]
    );
  }
}

async function applyArchive(client, ids) {
  const batch = 'test-' + new Date().toISOString().replace(/[:.]/g, '');
  await client.query('BEGIN');
  try {
    const orders = await lockRows(client, 'orders', ids.orders, 'int[]');
    const payments = await lockRows(client, 'payments', ids.payments, 'int[]');
    const shipments = await lockRows(client, 'shipments', ids.shipments, 'int[]');
    const waybills = await lockRows(client, 'waybills', ids.waybills, 'bigint[]');

    if (ids.orders.length) {
      const linkedPays = await client.query(
        'SELECT id, order_id FROM payments WHERE order_id = ANY($1::int[])',
        [ids.orders]
      );
      const paySet = {};
      ids.payments.forEach(function (id) { paySet[String(id)] = true; });
      const strayPays = linkedPays.rows.filter(function (row) { return !paySet[String(row.id)]; });
      if (strayPays.length) {
        throw new Error('To\'lovlar --ids ga qo\'shilmagan: ' + strayPays.map(function (r) { return r.id; }).join(','));
      }
      const linkedBills = await childRows(
        client,
        'SELECT id, order_id FROM waybills WHERE order_id = ANY($1::int[])',
        [ids.orders]
      );
      const billSet = {};
      ids.waybills.forEach(function (id) { billSet[String(id)] = true; });
      const strayBills = linkedBills.filter(function (row) { return !billSet[String(row.id)]; });
      if (strayBills.length) {
        throw new Error('Yuk xatilar --ids ga qo\'shilmagan: ' + strayBills.map(function (r) { return r.id; }).join(','));
      }
    }

    const orderItems = ids.orders.length
      ? await childRows(client, 'SELECT * FROM order_items WHERE order_id = ANY($1::int[])', [ids.orders])
      : [];
    const waybillItems = ids.waybills.length
      ? await childRows(client, 'SELECT * FROM waybill_items WHERE waybill_id = ANY($1::bigint[])', [ids.waybills])
      : [];
    const allocations = ids.waybills.length
      ? await childRows(client, 'SELECT * FROM agent_debt_allocations WHERE waybill_id = ANY($1::bigint[])', [ids.waybills])
      : [];
    const events = ids.waybills.length
      ? await childRows(client, 'SELECT * FROM agent_commission_events WHERE waybill_id = ANY($1::bigint[])', [ids.waybills])
      : [];

    await archiveCopy(client, batch, 'orders', orders);
    await archiveCopy(client, batch, 'order_items', orderItems);
    await archiveCopy(client, batch, 'payments', payments);
    await archiveCopy(client, batch, 'shipments', shipments);
    await archiveCopy(client, batch, 'waybills', waybills);
    await archiveCopy(client, batch, 'waybill_items', waybillItems);
    await archiveCopy(client, batch, 'agent_debt_allocations', allocations);
    await archiveCopy(client, batch, 'agent_commission_events', events);

    if (allocations.length) {
      await client.query('DELETE FROM agent_debt_allocations WHERE id = ANY($1::int[])', [allocations.map(function (r) { return r.id; })]);
    }
    if (waybillItems.length) {
      await client.query('DELETE FROM waybill_items WHERE id = ANY($1::int[])', [waybillItems.map(function (r) { return r.id; })]);
    }
    if (ids.waybills.length) {
      await client.query('DELETE FROM waybills WHERE id = ANY($1::bigint[])', [ids.waybills]);
    }
    if (orderItems.length) {
      await client.query('DELETE FROM order_items WHERE id = ANY($1::int[])', [orderItems.map(function (r) { return r.id; })]);
    }
    if (ids.payments.length) {
      await client.query('DELETE FROM payments WHERE id = ANY($1::int[])', [ids.payments]);
    }
    if (ids.shipments.length) {
      await client.query('DELETE FROM shipments WHERE id = ANY($1::int[])', [ids.shipments]);
    }
    if (ids.orders.length) {
      await client.query('DELETE FROM orders WHERE id = ANY($1::int[])', [ids.orders]);
    }
    await client.query('COMMIT');
    return {
      batch: batch,
      archived: orders.length + orderItems.length + payments.length + shipments.length + waybills.length + waybillItems.length + allocations.length + events.length,
      deleted_orders: orders.length,
      deleted_payments: payments.length,
      deleted_shipments: shipments.length,
      deleted_waybills: waybills.length,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {}
    if (missingTable(err)) {
      err.message = 'archived_rows yo\'q. migrations/006 ni qo\'llang. ' + err.message;
    }
    throw err;
  }
}

async function runCleanup(opts) {
  const log = opts.log || console.log;
  const apply = opts.apply === true;
  if (!apply) {
    const listing = await listCandidates(opts.client);
    printListing(listing, log);
    return { wrote: false, listing: listing };
  }
  if (!opts.ids) throw new Error('--apply uchun --ids fayl kerak');
  const ids = opts.ids;
  const summary = await applyArchive(opts.client, ids);
  log('Arxivlandi ' + summary.archived + ' qator, batch ' + summary.batch);
  return { wrote: true, summary: summary };
}

async function main() {
  const apply = process.argv.indexOf('--apply') !== -1;
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) {
    console.error('DATABASE_URL kerak');
    process.exit(1);
  }
  let ids = null;
  if (apply) {
    ids = loadIds(process.argv);
    if (!ids) {
      console.error('--apply uchun --ids fayl kerak. Avval dry-run qiling.');
      process.exit(1);
    }
  }
  const pool = poolFor(url);
  const client = await pool.connect();
  try {
    await runCleanup({ apply: apply, ids: ids, client: client });
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(function (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  parseIds: parseIds,
  listCandidates: listCandidates,
  printListing: printListing,
  suggestedIds: suggestedIds,
  applyArchive: applyArchive,
  runCleanup: runCleanup,
};
