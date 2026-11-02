const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('7. Mijoz ilovasi', () => {
  it('demo productionda yopiq, initData HMAC kerak', () => {
    const route = fs.readFileSync(path.join(__dirname, '../routes-customer-app.js'), 'utf8');
    assert.match(route, /ALLOW_DEMO_CUSTOMER === '1'/);
    assert.match(route, /checkTelegramInitData\(/);
    assert.match(route, /TELEGRAM_BOT_TOKEN/);
    assert.match(route, /maxAgeSec: 3600/);
    assert.doesNotMatch(route, /checkTelegramInitDataAny/);
    assert.doesNotMatch(route, /YUK_BOT_TOKEN/);
    assert.doesNotMatch(route, /ERP_BOT_TOKEN/);
    assert.equal(route.includes("ALLOW_DEMO_CUSTOMER !== '0'"), false);
  });

  it('/mijoz mavzu va katalog bor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/mijoz.html'), 'utf8') + fs.readFileSync(path.join(__dirname, '../public/mijoz-app.jsx'), 'utf8');
    assert.match(html, /tokens\.css/);
    assert.match(html, /theme\.js/);
    assert.match(html, /\/api\/customer\/catalog/);
  });
});
