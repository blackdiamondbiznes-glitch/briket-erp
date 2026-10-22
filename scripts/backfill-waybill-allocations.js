/**
 * Mavjud yuk xati paid_amount ini payment_allocations ga bog'laydi.
 * Dry-run — standart. --apply yozadi. Hech narsa o'chirmaydi.
 * paid_amount / debt_amount o'zgartirilmaydi.
 * Butun bo'lmagan summa o'tkazib yuboriladi (hisobotda KO'RINADI).
 *
 *   node scripts/backfill-waybill-allocations.js
 *   node scripts/backfill-waybill-allocations.js --apply
 *
 * Productionda avval dry-run natijasini ko'rib chiqing.
 */
require('dotenv').config();
const { Pool } = require('pg');

function arg(name) {
  return process.argv.indexOf(name) !== -1;
}

function wholeSom(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (Math.abs(n - Math.round(n)) > 0.001) return null;
  return Math.round(n);
}

async function main() {
  const apply = arg('--apply');
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) {
    console.error('DATABASE_URL yo\'q');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const rows = await client.query(
      `SELECT w.id, w.waybill_code, w.customer_id, w.paid_amount, w.debt_amount,
              w.total_amount, w.legacy_source, w.stock_posted, w.sale_date
       FROM waybills w
       WHERE w.paid_amount > 0
         AND NOT EXISTS (
           SELECT 1 FROM payment_allocations a WHERE a.waybill_id = w.id
         )
       ORDER BY w.sale_date ASC NULLS LAST, w.id ASC`
    );
    console.log(apply ? 'APPLY' : 'DRY-RUN', '— taqsimsiz to\'lovli yuk xati:', rows.rows.length);
    let ready = 0;
    let skipped = 0;
    for (let i = 0; i < rows.rows.length; i++) {
      const row = rows.rows[i];
      const paid = wholeSom(row.paid_amount);
      const tag = row.legacy_source ? 'legacy' : 'erp';
      if (paid == null) {
        skipped += 1;
        console.log('SKIP\t' + row.waybill_code + '\tpaid=' + row.paid_amount + '\tbutun so\'m emas\t' + tag);
        continue;
      }
      ready += 1;
      console.log(
        (apply ? 'YAZILADI' : 'REJA') +
          '\t' + row.waybill_code +
          '\t#' + row.id +
          '\tpaid=' + paid +
          '\tdebt=' + row.debt_amount +
          '\tstock_posted=' + row.stock_posted +
          '\t' + tag
      );
      if (!apply) continue;
      await client.query('BEGIN');
      try {
        const again = await client.query(
          'SELECT 1 FROM payment_allocations WHERE waybill_id = $1 LIMIT 1',
          [row.id]
        );
        if (again.rows.length) {
          await client.query('ROLLBACK');
          continue;
        }
        const pay = await client.query(
          `INSERT INTO payments
             (order_id, customer_id, amount, method, note, kind, paid_at)
           VALUES (NULL,$1,$2,'cash',$3,'backfill', NOW())
           RETURNING id`,
          [row.customer_id, paid, 'Taqsim backfill ' + (row.waybill_code || row.id)]
        );
        await client.query(
          `INSERT INTO payment_allocations (payment_id, waybill_id, amount)
           VALUES ($1,$2,$3)`,
          [pay.rows[0].id, row.id, paid]
        );
        await client.query('COMMIT');
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) {}
        throw err;
      }
    }
    console.log('tayyor:', ready, 'o\'tkazib yuborildi:', skipped, apply ? '(yozildi)' : '(yozilmadi)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
