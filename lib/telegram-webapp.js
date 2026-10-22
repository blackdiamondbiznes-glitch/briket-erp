/**
 * Telegram WebApp initData tekshiruvi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
const crypto = require('crypto');

const DEFAULT_MAX_AGE_SEC = 86400;

function validateTelegramInitData(initData, botToken, options) {
  const opts = options || {};
  const maxAgeSec = opts.maxAgeSec == null ? DEFAULT_MAX_AGE_SEC : Number(opts.maxAgeSec);
  if (!initData || !botToken) return null;
  if (String(initData).length > 4096) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) return null;
    params.delete('hash');
    const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => k + '=' + v).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const a = Buffer.from(calculated, 'hex');
    const b = Buffer.from(String(hash), 'hex');
    if (a.length !== 32 || b.length !== 32 || !crypto.timingSafeEqual(a, b)) return null;

    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || !Number.isFinite(authDate)) return null;
    const nowSec = opts.nowSec != null ? Number(opts.nowSec) : Date.now() / 1000;
    if (authDate - nowSec > 60) return null;
    if (maxAgeSec >= 0 && nowSec - authDate > maxAgeSec) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    if (!user || user.id == null || user.id === '') return null;
    return user;
  } catch (e) {
    return null;
  }
}

function signTelegramInitData(fields, botToken) {
  const params = new URLSearchParams();
  Object.keys(fields).forEach(function (key) {
    if (key === 'hash') return;
    params.set(key, fields[key] == null ? '' : String(fields[key]));
  });
  const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => k + '=' + v).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

module.exports = {
  validateTelegramInitData,
  signTelegramInitData,
  DEFAULT_MAX_AGE_SEC,
};
