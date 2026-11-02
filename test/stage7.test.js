const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('7. Mijoz ilovasi', () => {
  it('demo productionda yopiq, initData HMAC kerak', () => {
    const route = fs.readFileSync(path.join(__dirname, '../routes-customer-app.js'), 'utf8');
    assert.match(route, /ALLOW_DEMO_CUSTOMER === '1'/);
    assert.match(route, /checkTelegramInitDataAny/);
    assert.equal(route.includes("ALLOW_DEMO_CUSTOMER !== '0'"), false);
  });

  it('/mijoz mavzu va katalog bor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/mijoz.html'), 'utf8');
    assert.match(html, /tokens\.css/);
    assert.match(html, /theme\.js/);
    assert.match(html, /\/api\/customer\/catalog/);
  });
});
