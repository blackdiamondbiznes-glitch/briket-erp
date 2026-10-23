/**
 * Telegram orqali admin. ADMIN_TELEGRAM_IDS vergul bilan telegram id.
 * Bo'sh ro'yxat hech kimni qo'ymaydi — ID kodga yozilmaydi.
 * /yuk egasi uchun initData umri 1 soatdan oshmaydi.
 */
const { checkTelegramInitDataAny, configuredInitDataTokens } = require('./telegram-webapp');

const INITDATA_ERRORS = {
  missing: 'Telegram initData yo\'q',
  missing_token: 'YUK_BOT_TOKEN, ERP_BOT_TOKEN yoki TELEGRAM_BOT_TOKEN o\'rnatilmagan',
  too_long: 'Telegram initData juda uzun',
  hash_missing: 'Telegram initData da hash yo\'q',
  hash_mismatch: 'Telegram initData hash mos emas',
  expired: 'Telegram initData eskirgan',
  auth_date_missing: 'Telegram initData sanasi yo\'q',
  auth_date_invalid: 'Telegram initData sanasi noto\'g\'ri',
  auth_date_future: 'Telegram initData sanasi kelajakda',
  user_missing: 'Telegram initData da foydalanuvchi yo\'q',
};

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
  const checked = checkTelegramInitDataAny(initData, configuredInitDataTokens(), {
    maxAgeSec: ownerInitDataMaxAge(),
    nowSec: nowSec,
  });
  if (!checked.ok || !checked.user || checked.user.id == null) {
    const reason = checked.reason || 'hash_mismatch';
    return {
      ok: false,
      status: reason === 'missing_token' ? 503 : 401,
      reason: reason,
      error: INITDATA_ERRORS[reason] || 'Telegram initData yaroqsiz',
    };
  }
  const user = checked.user;
  if (allowed.indexOf(String(user.id)) === -1) {
    return { ok: false, status: 403, error: 'Bu Telegram hisobi egasi emas' };
  }
  return { ok: true, user: user, role: 'owner' };
}

function telegramAdminUser(req) {
  const raw = (process.env.ADMIN_TELEGRAM_IDS || '').trim();
  const tokens = configuredInitDataTokens();
  if (!raw || !tokens.length || !req) return null;
  const initData = (req.headers && req.headers['x-telegram-init-data']) || '';
  if (!initData) return null;
  const checked = checkTelegramInitDataAny(initData, tokens, {
    maxAgeSec: ownerInitDataMaxAge(),
  });
  if (!checked.ok || !checked.user || checked.user.id == null) return null;
  const user = checked.user;
  const allowed = allowList();
  if (allowed.indexOf(String(user.id)) === -1) return null;
  return user;
}

module.exports = {
  telegramAdminUser: telegramAdminUser,
  authenticateOwner: authenticateOwner,
  ownerInitDataMaxAge: ownerInitDataMaxAge,
  OWNER_INITDATA_MAX_AGE_SEC: OWNER_INITDATA_MAX_AGE_SEC,
  INITDATA_ERRORS: INITDATA_ERRORS,
};
