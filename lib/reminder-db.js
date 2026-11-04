/**
 * Qarz eslatmasi SQL. Mavjud to'lov + payment_allocations orqali yozadi.
 */
const plan = require('./reminder-plan');

const SETTING_KEYS = ['reminders_enabled', 'reminder_repeat_days', 'admin_chat_id'];

function mapSettings(rows) {
  const out = {
    reminders_enabled: 'false',
    reminder_repeat_days: '3',
    admin_chat_id: '',
  };
  (rows || []).forEach(function (row) {
    if (SETTING_KEYS.indexOf(row.key) !== -1) out[row.key] = row.value == null ? '' : String(row.value);
  });
  return out;
}

function createReminderDb(pool, deps) {
  const extra = deps || {};
  async function q(sql, params) {
    return pool.query(sql, params);
  }

  return {
    async loadSettings() {
      const r = await q(
        'SELECT key, value FROM settings WHERE key = ANY($1::text[])',
        [SETTING_KEYS]
      );
      return mapSettings(r.rows);
    },

    today() {
      return extra.today ? extra.today() : plan.tashkentYmd(new Date());
    },

    log(line) {
      console.log(plan.redact(String(line || ''), process.env.TELEGRAM_BOT_TOKEN || ''));
    },

    async listDue(today) {
      const r = await q(
        `SELECT w.id AS waybill_id, w.waybill_code, w.customer_id,
                w.total_amount, w.paid_amount, w.debt_amount, w.due_date,
                c.name AS customer_name, c.telegram_id
         FROM waybills w
         JOIN customers c ON c.id = w.customer_id
         WHERE w.debt_amount > 0
           AND w.due_date IS NOT NULL
           AND w.due_date <= $1::date
         ORDER BY w.due_date, w.id`,
        [today]
      );
      return r.rows;
    },

    async lastReminder(waybillId) {
      const r = await q(
        `SELECT (sent_at AT TIME ZONE 'Asia/Tashkent')::date AS sent_on, kind
         FROM debt_reminders
         WHERE waybill_id = $1 AND status = 'sent'
         ORDER BY sent_at DESC
         LIMIT 1`,
        [waybillId]
      );
      if (!r.rows.length) return null;
      return { sent_on: String(r.rows[0].sent_on).slice(0, 10), kind: r.rows[0].kind };
    },

    async sentOn(waybillId, today) {
      const r = await q(
        `SELECT 1 FROM debt_reminders
         WHERE waybill_id = $1
           AND status = 'sent'
           AND (sent_at AT TIME ZONE 'Asia/Tashkent')::date = $2::date
         LIMIT 1`,
        [waybillId, today]
      );
      return r.rows.length > 0;
    },

    async insertReminder(row) {
      await q(
        `INSERT INTO debt_reminders
           (waybill_id, customer_id, kind, telegram_message_id, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.waybillId, row.customerId, row.kind, row.messageId || null, row.status || 'sent']
      );
    },

    async getWaybill(waybillId) {
      const r = await q(
        `SELECT w.id AS waybill_id, w.waybill_code, w.customer_id,
                w.total_amount, w.paid_amount, w.debt_amount, w.due_date,
                c.name AS customer_name, c.telegram_id
         FROM waybills w
         JOIN customers c ON c.id = w.customer_id
         WHERE w.id = $1`,
        [waybillId]
      );
      return r.rows[0] || null;
    },

    async insertClaim(row) {
      const r = await q(
        `INSERT INTO payment_claims (waybill_id, customer_id, amount, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, waybill_id, customer_id, amount, status`,
        [row.waybillId, row.customerId, row.amount]
      );
      return r.rows[0];
    },

    async listClaims() {
      const r = await q(
        `SELECT c.id, c.amount, c.status, c.created_at, c.decided_at, c.decided_by,
                w.waybill_code, cu.name AS customer_name
         FROM payment_claims c
         JOIN waybills w ON w.id = c.waybill_id
         JOIN customers cu ON cu.id = c.customer_id
         ORDER BY c.id DESC
         LIMIT 100`
      );
      return r.rows;
    },

    async rejectClaim(claimId, decidedBy) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(
          'SELECT * FROM payment_claims WHERE id = $1 FOR UPDATE',
          [claimId]
        );
        if (!found.rows.length) {
          await client.query('ROLLBACK');
          return null;
        }
        const claim = found.rows[0];
        if (claim.status !== 'pending') {
          await client.query('ROLLBACK');
          return { already: true, claim: claim };
        }
        await client.query(
          `UPDATE payment_claims
             SET status = 'rejected', decided_by = $2, decided_at = NOW()
           WHERE id = $1`,
          [claimId, decidedBy || null]
        );
        const wb = await client.query(
          `SELECT w.id AS waybill_id, w.waybill_code, c.telegram_id
           FROM waybills w JOIN customers c ON c.id = w.customer_id
           WHERE w.id = $1`,
          [claim.waybill_id]
        );
        await client.query('COMMIT');
        return { claim: claim, waybill: wb.rows[0] || null };
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        throw err;
      } finally {
        client.release();
      }
    },

    async approveClaim(claimId, decidedBy) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(
          'SELECT * FROM payment_claims WHERE id = $1 FOR UPDATE',
          [claimId]
        );
        if (!found.rows.length) {
          await client.query('ROLLBACK');
          return { reason: 'missing' };
        }
        const claim = found.rows[0];
        if (claim.status !== 'pending') {
          await client.query('ROLLBACK');
          return { reason: 'already', claim: claim };
        }
        const locked = await client.query(
          `SELECT id, customer_id, waybill_code, total_amount, paid_amount, debt_amount
           FROM waybills WHERE id = $1 FOR UPDATE`,
          [claim.waybill_id]
        );
        if (!locked.rows.length || String(locked.rows[0].customer_id) !== String(claim.customer_id)) {
          await client.query('ROLLBACK');
          return { reason: 'not_owner' };
        }
        const wb = locked.rows[0];
        const alloc = await client.query(
          `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS sum
           FROM payment_allocations WHERE waybill_id = $1`,
          [wb.id]
        );
        const requestId = 'reminder-claim-' + claim.id;
        const existing = await client.query(
          'SELECT id FROM payments WHERE request_id = $1 LIMIT 1',
          [requestId]
        );
        let money;
        if (existing.rows.length) {
          const summed = await client.query(
            'SELECT COALESCE(SUM(amount), 0) AS sum FROM payment_allocations WHERE waybill_id = $1',
            [wb.id]
          );
          const paid = plan.whole(summed.rows[0].sum);
          const total = plan.whole(wb.total_amount);
          const debt = Math.max(0, total - paid);
          money = {
            paid: paid,
            debt: debt,
            status: debt <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'open'),
          };
        } else {
          money = plan.settleMoney({
            total_amount: wb.total_amount,
            paid_amount: wb.paid_amount,
            alloc_count: alloc.rows[0].count,
            alloc_sum: alloc.rows[0].sum,
          }, claim.amount);
          if (money.error) {
            await client.query('ROLLBACK');
            return { reason: money.error };
          }
        }
        if (!existing.rows.length) {
          if (money.backfill > 0) {
            const back = await client.query(
              `INSERT INTO payments
                 (order_id, customer_id, amount, method, note, kind, request_id)
               VALUES (NULL, $1, $2, 'cash', $3, 'backfill', $4)
               RETURNING id`,
              [
                wb.customer_id,
                money.backfill,
                "Tarixiy to'lov " + (wb.waybill_code || ''),
                requestId + ':backfill',
              ]
            );
            await client.query(
              `INSERT INTO payment_allocations (payment_id, waybill_id, amount)
               VALUES ($1, $2, $3)`,
              [back.rows[0].id, wb.id, money.backfill]
            );
          }
          const pay = await client.query(
            `INSERT INTO payments
               (order_id, customer_id, amount, method, note, kind, request_id)
             VALUES (NULL, $1, $2, 'cash', $3, 'collection', $4)
             RETURNING id`,
            [
              wb.customer_id,
              plan.whole(claim.amount),
              'Qarz eslatmasi ' + (wb.waybill_code || ''),
              requestId,
            ]
          );
          await client.query(
            `INSERT INTO payment_allocations (payment_id, waybill_id, amount)
             VALUES ($1, $2, $3)`,
            [pay.rows[0].id, wb.id, plan.whole(claim.amount)]
          );
        }
        await client.query(
          `UPDATE waybills
             SET paid_amount = $2, debt_amount = $3, status = $4, updated_at = NOW()
           WHERE id = $1`,
          [wb.id, money.paid, money.debt, money.status]
        );
        await client.query(
          `UPDATE payment_claims
             SET status = 'approved', decided_by = $2, decided_at = NOW()
           WHERE id = $1`,
          [claimId, decidedBy || null]
        );
        const who = await client.query(
          `SELECT c.telegram_id, w.waybill_code
           FROM waybills w JOIN customers c ON c.id = w.customer_id
           WHERE w.id = $1`,
          [wb.id]
        );
        await client.query('COMMIT');
        return {
          money: money,
          waybill: who.rows[0] || { telegram_id: '', waybill_code: wb.waybill_code },
        };
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function telegramCall(token, method, payload, fetchImpl) {
  const secret = String(token || '');
  if (!secret) throw new Error('TELEGRAM_BOT_TOKEN yo\'q');
  const fetchFn = fetchImpl || global.fetch;
  if (typeof fetchFn !== 'function') throw new Error('fetch yo\'q');
  let res;
  try {
    res = await fetchFn('https://api.telegram.org/bot' + secret + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(plan.redact(err && err.message, secret));
  }
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data || data.ok !== true) {
    const desc = data && data.description ? data.description : 'Telegram xato';
    throw new Error(plan.redact(desc, secret));
  }
  return data.result || {};
}

module.exports = {
  mapSettings: mapSettings,
  createReminderDb: createReminderDb,
  telegramCall: telegramCall,
};
