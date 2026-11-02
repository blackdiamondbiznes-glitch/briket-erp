const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('6. Admin UI va mavzu', () => {
  it('/yuk da Briket ERP tugmasi bor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/yuk.html'), 'utf8') + fs.readFileSync(path.join(__dirname, '../public/yuk-app.js'), 'utf8');
    assert.match(html, /erp-back\.js/);
    assert.match(html, /erpBackLink\(/);
    assert.doesNotMatch(html, /← Briket ERP/);
    const back = fs.readFileSync(path.join(__dirname, '../public/erp-back.js'), 'utf8');
    assert.match(back, /Briket ERP/);
    assert.match(back, /width="16"/);
    assert.match(back, /height="16"/);
    assert.match(back, /fill="none"/);
    assert.match(back, /stroke="currentColor"/);
    assert.match(back, /stroke-width="2"/);
    assert.match(back, /stroke-linecap="round"/);
    assert.match(back, /stroke-linejoin="round"/);
    assert.match(back, /m15 18-6-6 6-6/);
    assert.match(back, /gap:6px/);
    assert.match(back, /align-items:center/);
    assert.doesNotMatch(back, /←/);
    assert.match(html, /href="\/admin"/);
    assert.match(html, /tokens\.css/);
    assert.match(html, /theme\.js/);
  });

  it('admin da KPI, grafik va tezkor amallar bor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8') + fs.readFileSync(path.join(__dirname, '../public/admin-app.jsx'), 'utf8');
    assert.match(html, /dash-kpis/);
    assert.match(html, /dash-charts/);
    assert.match(html, /Tez amallar/);
    assert.match(html, /tokens\.css/);
    assert.match(html, /theme\.js/);
  });

  it('Telegram yorug va qorongi mavzu data-theme qo\'yadi', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/theme.js'), 'utf8');
    assert.match(js, /data-theme/);
    assert.match(js, /themeChanged/);
    assert.match(js, /4\.5/);
  });
});
