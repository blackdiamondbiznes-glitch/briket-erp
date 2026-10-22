/**
 * Telegram orqali admin. ADMIN_TELEGRAM_IDS vergul bilan telegram id.
 * Bo'sh ro'yxat hech kimni qo'ymaydi — ID kodga yozilmaydi.
 * /yuk egasi uchun initData umri 1 soatdan oshmaydi.
 */
const { validateTelegramInitData } = require('./telegram-webapp');

const OWNER_INITDATA_MAX_AGE_SEC = 3600;

function allowList() {
  return (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function ownerInitDataMaxAge() {
  const raw = process.env.TELEGRAM_INITDATA_MAX_AGE_SEC;
  let n = OWNER_INITDATA_MAX_AGE_SEC;
  if (raw != null && String(raw).trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) n = parsed;
  }
  if (n > OWNER_INITDATA_MAX_AGE_SEC) n = OWNER_INITDATA_MAX_AGE_SEC;
  return n;
}

function authenticateOwner(initData, nowSec) {
  const allowed = allowList();
  if (!allowed.length) {
    return {
      ok: false,
      status: 401,
      error: 'ADMIN_TELEGRAM_IDS bo\'sh — hech kimga ruxsat yo\'q',
    };
  }
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) {
    return { ok: false, status: 503, error: 'TELEGRAM_BOT_TOKEN o\'rnatilmagan' };
  }
  const user = validateTelegramInitData(initData, token, {
    maxAgeSec: ownerInitDataMaxAge(),
    nowSec: nowSec,
  });
  if (!user || user.id == null) {
    return { ok: false, status: 401, error: 'Telegram initData yaroqsiz yoki eskirgan' };
  }
  if (allowed.indexOf(String(user.id)) === -1) {
    return { ok: false, status: 403, error: 'Bu Telegram hisobi egasi emas' };
  }
  return { ok: true, user: user, role: 'owner' };
}

function telegramAdminUser(req) {
  const raw = (process.env.ADMIN_TELEGRAM_IDS || '').trim();
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!raw || !token || !req) return null;
  const initData = (req.headers && req.headers['x-telegram-init-data']) || '';
  if (!initData) return null;
  const user = validateTelegramInitData(initData, token, {
    maxAgeSec: ownerInitDataMaxAge(),
  });
  if (!user || user.id == null) return null;
  const allowed = allowList();
  if (allowed.indexOf(String(user.id)) === -1) return null;
  return user;
}

module.exports = {
  telegramAdminUser: telegramAdminUser,
  authenticateOwner: authenticateOwner,
  ownerInitDataMaxAge: ownerInitDataMaxAge,
  OWNER_INITDATA_MAX_AGE_SEC: OWNER_INITDATA_MAX_AGE_SEC,
};
