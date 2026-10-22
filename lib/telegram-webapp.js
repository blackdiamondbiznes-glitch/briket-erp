/**
 * Telegram WebApp initData tekshiruvi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * data_check_string = barcha maydonlar, hash dan tashqari, alifbo tartibida.
 * signature (Ed25519, uchinchi tomon) shu qatorda QOLADI. Faqat hash olib tashlanadi.
 * secret_key = HMAC_SHA256(bot_token, "WebAppData")
 * auth_date — Unix soniya. 1e12 dan katta bo'lsa millisoniya deb qaraladi.
 */
const crypto = require('crypto');

const DEFAULT_MAX_AGE_SEC = 86400;
const MAX_INITDATA_LEN = 16384;

function fail(reason) {
  return { ok: false, user: null, reason: reason };
}

function checkTelegramInitData(initData, botToken, options) {
  const opts = options || {};
  const maxAgeSec = opts.maxAgeSec == null ? DEFAULT_MAX_AGE_SEC : Number(opts.maxAgeSec);
  const token = String(botToken || '').trim();
  const raw = initData == null ? '' : String(initData);
  if (!raw) return fail('missing');
  if (!token) return fail('missing_token');
  if (raw.length > MAX_INITDATA_LEN) return fail('too_long');
  try {
    const params = new URLSearchParams(raw);
    const hash = params.get('hash');
    if (!hash) return fail('hash_missing');
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) return fail('hash_mismatch');
    params.delete('hash');
    const entries = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const dataCheckString = entries.map(([k, v]) => k + '=' + v).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calculated = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const a = Buffer.from(calculated, 'hex');
    const b = Buffer.from(String(hash), 'hex');
    if (a.length !== 32 || b.length !== 32 || !crypto.timingSafeEqual(a, b)) return fail('hash_mismatch');

    let authDate = Number(params.get('auth_date'));
    if (!params.get('auth_date')) return fail('auth_date_missing');
    if (!Number.isFinite(authDate)) return fail('auth_date_invalid');
    if (authDate > 1e12) authDate = Math.floor(authDate / 1000);
    const nowSec = opts.nowSec != null ? Number(opts.nowSec) : Date.now() / 1000;
    if (authDate - nowSec > 60) return fail('auth_date_future');
    if (maxAgeSec >= 0 && nowSec - authDate > maxAgeSec) return fail('expired');

    const userRaw = params.get('user');
    if (!userRaw) return fail('user_missing');
    const user = JSON.parse(userRaw);
    if (!user || user.id == null || user.id === '') return fail('user_missing');
    return { ok: true, user: user, reason: 'ok' };
  } catch (e) {
    return fail('hash_mismatch');
  }
}

function validateTelegramInitData(initData, botToken, options) {
  const result = checkTelegramInitData(initData, botToken, options);
  return result.ok ? result.user : null;
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
  checkTelegramInitData,
  signTelegramInitData,
  DEFAULT_MAX_AGE_SEC,
  MAX_INITDATA_LEN,
};
