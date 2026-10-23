/**
 * /yuk kirish so'rovi. Eski mini-app oqimi:
 * PENDING_APPROVAL / REJECTED, bitta qator, 1 soatlik ogohlantirish.
 * Token qiymati logga yozilmaydi va javobga kiritilmaydi.
 * Bo'sh ADMIN_TELEGRAM_IDS hech kimni qo'ymaydi (eski fallback ID yo'q).
 */
const crypto = require('crypto');
const { authenticateOwner } = require('./admin-auth');
const { INITDATA_TOKEN_ENVS } = require('./telegram-webapp');

const DEDUP_MS = 60 * 60 * 1000;
const PENDING_ERROR = 'Kirish so\'rovi yuborildi. Admin tasdiqlashini kuting.';
const REJECTED_ERROR = 'Kirish rad etilgan. Admin bilan bog\'laning.';
const LOCKED_ERROR = 'Bu Telegram hisobi egasi emas';
const MIGRATION_ERROR = 'Yuk kirish jadvallari yo\'q. migrations/009_yuk_access.sql ni qo\'llang.';
const TOKEN_ENVS = INITDATA_TOKEN_ENVS;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clip(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function allowList() {
  return (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function profileFromUser(user) {
  const id = String(user && user.id != null ? user.id : '').trim();
  if (!/^\d{1,20}$/.test(id)) return null;
  const firstName = clip(user.first_name, 64);
  const lastName = clip(user.last_name, 64);
  let username = clip(user.username, 32).replace(/^@+/, '');
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    telegramId: id,
    firstName: firstName || null,
    lastName: lastName || null,
    username: username || null,
    fullName: fullName || null,
  };
}

function tokenForEnv(botEnv) {
  if (TOKEN_ENVS.indexOf(botEnv) === -1) return '';
  return String(process.env[botEnv] || '').trim();
}

function secretsMatch(expected, given) {
  const a = Buffer.from(String(expected), 'utf8');
  const b = Buffer.from(String(given), 'utf8');
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function missingTable(err) {
  return err && (err.code === '42P01' || err.code === '42703');
}

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function tashkentStamp(date) {
  try {
    return date.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  } catch (e) {
    return date.toISOString();
  }
}

function ownerMessage(row, now) {
  const uname = row.username ? '@' + escapeHtml(row.username) : '—';
  return (
    '🔐 Yangi kirish so\'rovi\n' +
    'Ism: ' + escapeHtml(row.full_name || '—') + '\n' +
    'Username: ' + uname + '\n' +
    'id: <code>' + row.telegram_id + '</code>\n' +
    'Vaqt: ' + escapeHtml(tashkentStamp(now))
  );
}

function ownerKeyboard(telegramId) {
  return {
    inline_keyboard: [[
      { text: '✅ Tasdiqlash', callback_data: 'access_approve:' + telegramId },
      { text: '❌ Rad etish', callback_data: 'access_reject:' + telegramId },
    ]],
  };
}

function decisionText(approved, row, adminId) {
  const username = row.username ? '@' + row.username : '—';
  return (
    (approved ? '✅ Tasdiqlandi' : '❌ Rad etildi') + '\n' +
    'Ism: ' + (row.full_name || '—') + '\n' +
    'Username: ' + username + '\n' +
    'id: ' + row.telegram_id + '\n' +
    'Admin: ' + adminId
  );
}

function dmText(approved) {
  return approved
    ? '✅ Kirish so\'rovingiz tasdiqlandi. Mini Appni qayta oching.'
    : '❌ Kirish so\'rovingiz rad etildi. Admin bilan bog\'laning.';
}

function parseRefs(text) {
  return String(text || '').split(',').map(function (part) {
    const match = /^(\d+):(\d+)$/.exec(String(part || '').trim());
    if (!match) return null;
    return { chat_id: match[1], message_id: Number(match[2]) };
  }).filter(Boolean);
}

function publicRow(row) {
  if (!row) return null;
  return {
    telegram_id: String(row.telegram_id),
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    username: row.username || null,
    full_name: row.full_name || null,
    status: row.status,
    created_at: row.created_at || null,
    decided_at: row.decided_at || null,
    decided_by: row.decided_by || null,
  };
}

function memoryBackend(store) {
  if (!store.yukAccess) store.yukAccess = { requests: [], allowed: [] };
  const db = store.yukAccess;
  return {
    async get(telegramId) {
      return db.requests.find(function (row) { return row.telegram_id === String(telegramId); }) || null;
    },
    async save(row) {
      const next = Object.assign({}, row, { telegram_id: String(row.telegram_id) });
      const index = db.requests.findIndex(function (item) { return item.telegram_id === next.telegram_id; });
      if (index === -1) db.requests.push(next);
      else db.requests[index] = next;
      return next;
    },
    async list(status) {
      return db.requests.filter(function (row) { return !status || row.status === status; }).slice().sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
    },
    async isAllowed(telegramId) {
      return db.allowed.some(function (row) { return row.telegram_id === String(telegramId); });
    },
    async allow(row) {
      const next = Object.assign({}, row, { telegram_id: String(row.telegram_id) });
      const index = db.allowed.findIndex(function (item) { return item.telegram_id === next.telegram_id; });
      if (index === -1) db.allowed.push(next);
      else db.allowed[index] = next;
      return next;
    },
    async revoke(telegramId) {
      db.allowed = db.allowed.filter(function (row) { return row.telegram_id !== String(telegramId); });
    },
  };
}

function sqlBackend(pool) {
  return {
    async get(telegramId) {
      const result = await pool.query(
        'SELECT * FROM yuk_access_requests WHERE telegram_id = $1',
        [String(telegramId)]
      );
      return result.rows[0] || null;
    },
    async save(row) {
      const result = await pool.query(
        `INSERT INTO yuk_access_requests
          (telegram_id, first_name, last_name, username, full_name, status, bot_env,
           notify_message_id, notify_refs, created_at, notified_at, decided_at, decided_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamptz, NOW()), $11::timestamptz, $12::timestamptz, $13)
         ON CONFLICT (telegram_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           username = EXCLUDED.username,
           full_name = EXCLUDED.full_name,
           status = EXCLUDED.status,
           bot_env = COALESCE(EXCLUDED.bot_env, yuk_access_requests.bot_env),
           notify_message_id = COALESCE(EXCLUDED.notify_message_id, yuk_access_requests.notify_message_id),
           notify_refs = COALESCE(EXCLUDED.notify_refs, yuk_access_requests.notify_refs),
           created_at = COALESCE($10::timestamptz, yuk_access_requests.created_at),
           notified_at = EXCLUDED.notified_at,
           decided_at = EXCLUDED.decided_at,
           decided_by = EXCLUDED.decided_by
         RETURNING *`,
        [
          String(row.telegram_id),
          row.first_name || null,
          row.last_name || null,
          row.username || null,
          row.full_name || null,
          row.status,
          row.bot_env || null,
          row.notify_message_id || null,
          row.notify_refs || null,
          asIso(row.created_at),
          asIso(row.notified_at),
          asIso(row.decided_at),
          row.decided_by || null,
        ]
      );
      return result.rows[0];
    },
    async list(status) {
      const result = status
        ? await pool.query(
          'SELECT * FROM yuk_access_requests WHERE status = $1 ORDER BY created_at DESC, telegram_id',
          [status]
        )
        : await pool.query('SELECT * FROM yuk_access_requests ORDER BY created_at DESC, telegram_id');
      return result.rows;
    },
    async isAllowed(telegramId) {
      const result = await pool.query(
        'SELECT 1 FROM yuk_allowed_users WHERE telegram_id = $1',
        [String(telegramId)]
      );
      return result.rows.length > 0;
    },
    async allow(row) {
      await pool.query(
        `INSERT INTO yuk_allowed_users
          (telegram_id, first_name, last_name, username, full_name, approved_at, approved_by)
         VALUES ($1,$2,$3,$4,$5, NOW(), $6)
         ON CONFLICT (telegram_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           username = EXCLUDED.username,
           full_name = EXCLUDED.full_name,
           approved_at = NOW(),
           approved_by = EXCLUDED.approved_by`,
        [
          String(row.telegram_id),
          row.first_name || null,
          row.last_name || null,
          row.username || null,
          row.full_name || null,
          row.approved_by || null,
        ]
      );
    },
    async revoke(telegramId) {
      await pool.query('DELETE FROM yuk_allowed_users WHERE telegram_id = $1', [String(telegramId)]);
    },
  };
}

function createYukAccess(options) {
  const opts = options || {};
  const backend = opts.backend || (opts.pool ? sqlBackend(opts.pool) : memoryBackend(opts.store || {}));
  const fetchImpl = opts.fetchImpl || global.fetch;
  const api = {
    now: opts.now || function () { return new Date(); },
  };

  function clock() {
    const value = api.now();
    return value instanceof Date ? value : new Date(value);
  }

  async function tgCall(token, method, payload) {
    if (!token || typeof fetchImpl !== 'function') return { ok: false };
    let res;
    try {
      res = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { ok: false };
    }
    const body = await res.json().catch(function () { return null; });
    if (!res.ok || !body || body.ok !== true) return { ok: false };
    return { ok: true, body: body };
  }

  async function callBot(preferredEnv, method, payload) {
    const order = [];
    if (preferredEnv) order.push(preferredEnv);
    TOKEN_ENVS.forEach(function (name) {
      if (order.indexOf(name) === -1) order.push(name);
    });
    for (let i = 0; i < order.length; i++) {
      const token = tokenForEnv(order[i]);
      if (!token) continue;
      const result = await tgCall(token, method, payload);
      if (result.ok) return order[i];
    }
    return '';
  }

  async function notifyOwners(row, now) {
    const token = tokenForEnv(row.bot_env);
    if (!token) return [];
    const text = ownerMessage(row, now);
    const replyMarkup = ownerKeyboard(row.telegram_id);
    const refs = [];
    const owners = allowList();
    for (let i = 0; i < owners.length; i++) {
      const result = await tgCall(token, 'sendMessage', {
        chat_id: owners[i],
        text: text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
      const messageId = result.ok && result.body && result.body.result && result.body.result.message_id;
      if (messageId != null) refs.push({ chat_id: owners[i], message_id: messageId });
    }
    return refs;
  }

  async function editAndDm(row, approved, adminId) {
    const text = decisionText(approved, row, adminId);
    const refs = parseRefs(row.notify_refs);
    for (let i = 0; i < refs.length; i++) {
      await callBot(row.bot_env, 'editMessageText', {
        chat_id: refs[i].chat_id,
        message_id: refs[i].message_id,
        text: text,
      });
    }
    await callBot(row.bot_env, 'sendMessage', {
      chat_id: row.telegram_id,
      text: dmText(approved),
    });
  }

  async function authorize(initData, nowSec) {
    const auth = authenticateOwner(initData, nowSec);
    if (auth.ok || auth.status !== 403 || !auth.user) return auth;
    const telegramId = String(auth.user.id);
    let allowed = false;
    let row = null;
    try {
      allowed = await backend.isAllowed(telegramId);
      row = await backend.get(telegramId);
    } catch (err) {
      if (missingTable(err)) return { ok: false, status: 503, error: MIGRATION_ERROR };
      throw err;
    }
    if (allowed || (row && row.status === 'approved')) {
      return { ok: true, user: auth.user, role: 'writer', botEnv: auth.botEnv };
    }
    if (row && row.status === 'rejected') {
      return {
        ok: false,
        status: 403,
        code: 'REJECTED',
        error: REJECTED_ERROR,
        user: auth.user,
        botEnv: auth.botEnv,
      };
    }
    if (row && row.status === 'pending') {
      return {
        ok: false,
        status: 403,
        code: 'PENDING_APPROVAL',
        error: PENDING_ERROR,
        user: auth.user,
        botEnv: auth.botEnv,
      };
    }
    return {
      ok: false,
      status: 403,
      code: 'LOCKED',
      error: LOCKED_ERROR,
      user: auth.user,
      botEnv: auth.botEnv,
    };
  }

  function deniedBody(auth) {
    const payload = { ok: false, error: auth.error };
    if (auth.reason) payload.reason = auth.reason;
    if (auth.code) payload.code = auth.code;
    return payload;
  }

  async function requestAccess(initData, nowSec) {
    const auth = await authorize(initData, nowSec);
    if (auth.ok) return { status: 200, body: { ok: true, allowed: true, role: auth.role } };
    if (!auth.user || auth.code === 'REJECTED' || auth.status !== 403) {
      return { status: auth.status, body: deniedBody(auth) };
    }
    const profile = profileFromUser(auth.user);
    if (!profile) return { status: 400, body: { ok: false, error: 'Telegram ID noto\'g\'ri.' } };
    let existing = null;
    try {
      existing = await backend.get(profile.telegramId);
    } catch (err) {
      if (missingTable(err)) return { status: 503, body: { ok: false, error: MIGRATION_ERROR } };
      throw err;
    }
    if (existing && existing.status === 'rejected') {
      return { status: 403, body: { ok: false, code: 'REJECTED', error: REJECTED_ERROR } };
    }
    const now = clock();
    let createdAt = now.toISOString();
    let notifiedAt = existing && existing.notified_at ? asIso(existing.notified_at) : null;
    let shouldNotify = true;
    if (existing && existing.status === 'pending') {
      createdAt = asIso(existing.created_at) || createdAt;
      const stamp = existing.notified_at || existing.created_at;
      if (stamp && now.getTime() - new Date(stamp).getTime() < DEDUP_MS) shouldNotify = false;
    }
    let saved = await backend.save({
      telegram_id: profile.telegramId,
      first_name: profile.firstName,
      last_name: profile.lastName,
      username: profile.username,
      full_name: profile.fullName,
      status: 'pending',
      bot_env: auth.botEnv,
      notify_message_id: existing && existing.notify_message_id || null,
      notify_refs: existing && existing.notify_refs || null,
      created_at: createdAt,
      notified_at: notifiedAt,
      decided_at: null,
      decided_by: null,
    });
    if (shouldNotify) {
      const refs = await notifyOwners(saved, now);
      if (refs.length) {
        const last = refs[refs.length - 1];
        saved = await backend.save(Object.assign({}, saved, {
          notify_message_id: String(last.message_id),
          notify_refs: refs.map(function (ref) { return ref.chat_id + ':' + ref.message_id; }).join(','),
          created_at: createdAt,
          notified_at: now.toISOString(),
        }));
      }
    }
    return { status: 403, body: { ok: false, code: 'PENDING_APPROVAL', error: PENDING_ERROR } };
  }

  async function decide(telegramId, status, by) {
    if (status !== 'approved' && status !== 'rejected') throw httpError(400, 'status noto\'g\'ri');
    const id = String(telegramId || '').trim();
    if (!/^\d{1,20}$/.test(id)) throw httpError(400, 'id noto\'g\'ri');
    const existing = await backend.get(id);
    const now = clock();
    const saved = await backend.save({
      telegram_id: id,
      first_name: existing && existing.first_name || null,
      last_name: existing && existing.last_name || null,
      username: existing && existing.username || null,
      full_name: existing && existing.full_name || null,
      status: status,
      bot_env: existing && existing.bot_env || null,
      notify_message_id: existing && existing.notify_message_id || null,
      notify_refs: existing && existing.notify_refs || null,
      created_at: existing && existing.created_at ? asIso(existing.created_at) : now.toISOString(),
      notified_at: existing && existing.notified_at ? asIso(existing.notified_at) : null,
      decided_at: now.toISOString(),
      decided_by: String(by || ''),
    });
    if (status === 'approved') {
      await backend.allow({
        telegram_id: id,
        first_name: saved.first_name,
        last_name: saved.last_name,
        username: saved.username,
        full_name: saved.full_name,
        approved_by: String(by || ''),
      });
    } else {
      await backend.revoke(id);
    }
    await editAndDm(saved, status === 'approved', String(by || ''));
    return publicRow(saved);
  }

  async function handleWebhook(req) {
    if (req.method !== 'POST') return { status: 405, body: { ok: false, error: 'Faqat POST' } };
    const secret = String(process.env.YUK_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!secret) return { status: 503, body: { ok: false, error: 'YUK_WEBHOOK_SECRET o\'rnatilmagan' } };
    const header = req.headers['x-telegram-bot-api-secret-token'] || '';
    if (!secretsMatch(secret, header)) return { status: 401, body: { ok: false, error: 'Unauthorized' } };

    const update = req.body && typeof req.body === 'object' ? req.body : null;
    const cq = update && update.callback_query;
    if (!cq) return { status: 200, body: { ok: true } };

    const data = String(cq.data || '');
    const approveTg = /^access_approve:(\d+)$/.exec(data);
    const rejectTg = /^access_reject:(\d+)$/.exec(data);
    const fromId = String(cq.from && cq.from.id != null ? cq.from.id : '');
    const targetId = approveTg ? approveTg[1] : rejectTg ? rejectTg[1] : '';
    let row = null;
    if (targetId) {
      try {
        row = await backend.get(targetId);
      } catch (err) {
        if (missingTable(err)) return { status: 503, body: { ok: false, error: MIGRATION_ERROR } };
        throw err;
      }
    }
    const botEnv = row && row.bot_env || '';

    if (!allowList().includes(fromId)) {
      await callBot(botEnv, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Sizda ruxsat yo\'q.',
        show_alert: true,
      });
      return { status: 200, body: { ok: true } };
    }

    if (!approveTg && !rejectTg) {
      await callBot(botEnv, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: 'Noma\'lum amal',
        show_alert: false,
      });
      return { status: 200, body: { ok: true } };
    }

    const approved = Boolean(approveTg);
    await decide(targetId, approved ? 'approved' : 'rejected', fromId);
    const fresh = await backend.get(targetId);
    const env = (fresh && fresh.bot_env) || botEnv;
    await callBot(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: approved ? 'Tasdiqlandi ✅' : 'Rad etildi ❌',
      show_alert: false,
    });
    const chatId = cq.message && cq.message.chat && cq.message.chat.id;
    const messageId = cq.message && cq.message.message_id;
    if (chatId != null && messageId != null) {
      await callBot(env, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: decisionText(approved, fresh || { telegram_id: targetId }, fromId),
      });
    }
    return { status: 200, body: { ok: true } };
  }

  return {
    now: api.now,
    authorize: authorize,
    requestAccess: requestAccess,
    decide: decide,
    handleWebhook: handleWebhook,
    async list(status) {
      const rows = await backend.list(status);
      return rows.map(publicRow);
    },
    DEDUP_MS: DEDUP_MS,
    ownerMessage: ownerMessage,
    ownerKeyboard: ownerKeyboard,
  };
}

module.exports = {
  createYukAccess: createYukAccess,
  DEDUP_MS: DEDUP_MS,
  PENDING_ERROR: PENDING_ERROR,
  REJECTED_ERROR: REJECTED_ERROR,
};
