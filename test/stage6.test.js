const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

describe('6. Admin UI va mavzu', () => {
  it('/yuk da Briket ERP tugmasi bor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/yuk.html'), 'utf8');
    assert.match(html, /← Briket ERP/);
    assert.match(html, /href="\/admin"/);
    assert.match(html, /tokens\.css/);
    assert.match(html, /theme\.js/);
  });

  it('admin da KPI, grafik va tezkor amallar bor', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
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
