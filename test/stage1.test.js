const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const crypto = require('crypto');
const path = require('path');
const { authenticateAdminSession } = require('../lib/admin-auth');
const { signTelegramInitData, matchConfiguredInitData } = require('../lib/telegram-webapp');
const { plan, inspectSql } = require('../lib/migrate');

const ROOT = path.join(__dirname, '..');

function req(headers) {
  return { headers: headers || {} };
}

describe('1. Admin kalit', () => {
  it('faqat X-Admin-Key sarlavhasini qabul qiladi', () => {
    process.env.ADMIN_KEY = 'stage1-test-key';
    const ok = authenticateAdminSession(req({ 'x-admin-key': 'stage1-test-key', 'x-operator-name': 'Adham' }));
    assert.equal(ok.ok, true);
    assert.equal(ok.user.name, 'Adham');

    const queryStyle = authenticateAdminSession(req({}));
    assert.equal(queryStyle.ok, false);
    assert.equal(queryStyle.status, 401);

    const wrong = authenticateAdminSession(req({ 'x-admin-key': 'boshqa' }));
    assert.equal(wrong.ok, false);
    delete process.env.ADMIN_KEY;
  });
});

describe('1. initData uchta token tartibi', () => {
  it('YUK, keyin ERP, keyin TELEGRAM — birinchisi mos kelsa qabul', () => {
    const now = 1_700_000_000;
    const user = { id: 42, first_name: 'Adham' };
    const yuk = signTelegramInitData(
      { auth_date: now, user: JSON.stringify(user) },
      'yuk-token'
    );
    process.env.YUK_BOT_TOKEN = 'yuk-token';
    process.env.ERP_BOT_TOKEN = 'erp-token';
    process.env.TELEGRAM_BOT_TOKEN = 'mijoz-token';
    const matched = matchConfiguredInitData(yuk, { nowSec: now, maxAgeSec: 3600 });
    assert.equal(matched.ok, true);
    assert.equal(matched.botEnv, 'YUK_BOT_TOKEN');
    assert.equal(matched.user.id, 42);

    const mijoz = signTelegramInitData(
      { auth_date: now, user: JSON.stringify(user) },
      'mijoz-token'
    );
    delete process.env.YUK_BOT_TOKEN;
    delete process.env.ERP_BOT_TOKEN;
    const fallback = matchConfiguredInitData(mijoz, { nowSec: now, maxAgeSec: 3600 });
    assert.equal(fallback.ok, true);
    assert.equal(fallback.botEnv, 'TELEGRAM_BOT_TOKEN');

    const missing = matchConfiguredInitData('', { nowSec: now });
    assert.equal(missing.reason, 'missing');
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it('401 sabablari: missing, expired, hash_mismatch', () => {
    const now = 1_700_000_000;
    process.env.YUK_BOT_TOKEN = 'yuk-token';
    assert.equal(matchConfiguredInitData('', { nowSec: now }).reason, 'missing');
    const old = signTelegramInitData(
      { auth_date: now - 5000, user: JSON.stringify({ id: 1 }) },
      'yuk-token'
    );
    assert.equal(matchConfiguredInitData(old, { nowSec: now, maxAgeSec: 3600 }).reason, 'expired');
    const bad = signTelegramInitData(
      { auth_date: now, user: JSON.stringify({ id: 1 }) },
      'boshqa-token'
    );
    assert.equal(matchConfiguredInitData(bad, { nowSec: now, maxAgeSec: 3600 }).reason, 'hash_mismatch');
    delete process.env.YUK_BOT_TOKEN;
  });
});

describe('1. Migratsiya xavfsizligi', () => {
  it('004–011 fayllarida o\'chirish yo\'q', () => {
    const files = plan(ROOT);
    assert.ok(files.length >= 8);
    files.forEach((file) => {
      assert.equal(file.ok, true, file.name + ' xavfli: ' + file.hits.join(', '));
    });
  });

  it('DROP TABLE va DELETE ni rad etadi', () => {
    assert.equal(inspectSql('CREATE TABLE IF NOT EXISTS demo (id int)').ok, true);
    assert.equal(inspectSql('ALTER TABLE products ADD COLUMN IF NOT EXISTS note text').ok, true);
    assert.equal(inspectSql('DROP TABLE waybills').ok, false);
    assert.equal(inspectSql('DELETE FROM payments').ok, false);
    assert.equal(inspectSql('TRUNCATE waybills').ok, false);
  });
});

describe('1. Brend tokenlari', () => {
  it('oltin aksent va Inter saqlangan', () => {
    const css = require('fs').readFileSync(path.join(ROOT, 'public', 'tokens.css'), 'utf8');
    const theme = require('fs').readFileSync(path.join(ROOT, 'public', 'theme.js'), 'utf8');
    assert.match(css, /#c9a227/);
    assert.match(css, /Inter/);
    assert.match(css, /--tap:\s*44px/);
    assert.match(theme, /data-theme/);
    assert.match(theme, /themeParams/);
  });
});

describe('1. HMAC yordamchisi', () => {
  it('imzo barqaror', () => {
    const a = signTelegramInitData({ auth_date: 1, user: '{"id":1}' }, 't');
    const b = signTelegramInitData({ auth_date: 1, user: '{"id":1}' }, 't');
    assert.equal(a, b);
    assert.equal(crypto.createHash('sha256').update(a).digest('hex').length, 64);
  });
});
