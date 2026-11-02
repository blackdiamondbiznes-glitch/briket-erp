const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const { DEFAULTS } = require('../lib/settings');

describe('3. Yuk xati yadrosi', () => {
  it('qop 29 kg, qadoq haqi 700 — settings fallback, kodda qattiq emas', () => {
    assert.equal(DEFAULTS.sack_kg, 29);
    assert.equal(DEFAULTS.pack_unit_wage, 700);
    const prod = fs.readFileSync(path.join(__dirname, '../routes-production.js'), 'utf8');
    assert.equal(prod.includes('bags * 27'), false);
    assert.equal(prod.includes('unit_wage || 700'), false);
    assert.match(prod, /settings\.sackKg/);
    assert.match(prod, /settings\.packUnitWage/);
  });

  it('mahsulot o\'chirilmaydi, archived_rows ga nusxa', () => {
    const catalog = fs.readFileSync(path.join(__dirname, '../routes-catalog.js'), 'utf8');
    assert.equal(catalog.includes('DELETE FROM products'), false);
    assert.equal(catalog.includes('DELETE FROM materials'), false);
    assert.match(catalog, /archived_rows/);
    assert.match(catalog, /is_active = false/);
  });

  it('yuk xati orders ga yozilmaydi, idempotency va stock_posted bor', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../lib/yuk-sql.js'), 'utf8');
    const service = fs.readFileSync(path.join(__dirname, '../lib/yuk-service.js'), 'utf8');
    assert.match(sql, /INSERT INTO waybills/);
    assert.equal(sql.includes('INSERT INTO orders'), false);
    assert.match(sql, /idempotency_key/);
    assert.match(sql, /stock_posted/);
    assert.match(service, /findOwnerWaybillByRequestId/);
    const stock = fs.readFileSync(path.join(__dirname, '../routes-stock.js'), 'utf8');
    assert.match(stock, /stock_posted = true AND w\.reys_id IS NULL/);
  });
});
