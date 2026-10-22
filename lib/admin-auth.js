/**
 * Telegram orqali admin. ADMIN_TELEGRAM_IDS vergul bilan telegram id.
 * Bo'sh bo'lsa faqat X-Admin-Key ishlaydi.
 */
const { validateTelegramInitData } = require('./telegram-webapp');

function telegramAdminUser(req) {
  const raw = (process.env.ADMIN_TELEGRAM_IDS || '').trim();
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!raw || !token || !req) return null;
  const initData = (req.headers && req.headers['x-telegram-init-data']) || '';
  if (!initData) return null;
  const maxAge = process.env.TELEGRAM_INITDATA_MAX_AGE_SEC;
  const user = validateTelegramInitData(initData, token, {
    maxAgeSec: maxAge == null || maxAge === '' ? undefined : Number(maxAge),
  });
  if (!user || user.id == null) return null;
  const allowed = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (allowed.indexOf(String(user.id)) === -1) return null;
  return user;
}

module.exports = { telegramAdminUser: telegramAdminUser };
