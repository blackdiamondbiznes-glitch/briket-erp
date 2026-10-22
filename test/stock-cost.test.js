const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const stockCost = require('../lib/stock-cost');

test('foyda is sale minus tannarx, totals are times qty', function () {
  const figs = stockCost.figures(25000, 18000, 10);
  assert.equal(figs.unitCost, 18000);
  assert.equal(figs.margin, 7000);
  assert.equal(figs.profit_unit, 7000);
  assert.equal(figs.sell_price, 25000);
  assert.equal(figs.costValue, 180000);
  assert.equal(figs.potentialProfit, 70000);
  assert.equal(figs.value, 250000);
  assert.equal(figs.unitCost + figs.margin, figs.sell_price);
  assert.equal(figs.costValue + figs.potentialProfit, figs.value);
  assert.notEqual(figs.unitCost, figs.margin);
});

test('manual tannarx override wins over the recipe sum', function () {
  const ctx = {
    mats: [],
    recByPid: {
      4: [{ qty: 1, line_amount: 9000, price: 1, name: 'komir', unit: 'kg' }]
    },
    wageByPid: {}
  };
  const row = { id: 4, sku: '1.5kg Aktivator', weight_kg: 1.5, cost_price: 15000, price: 25000 };
  const cost = stockCost.unitCostFor(row, ctx);
  assert.equal(cost.cost_computed, 9000);
  assert.equal(cost.unit_cost, 15000);
  assert.equal(cost.cost_override, true);
  const figs = stockCost.figures(row.price, cost.unit_cost, 3);
  assert.equal(figs.unitCost, 15000);
  assert.equal(figs.margin, 10000);
  assert.equal(figs.costValue, 45000);
  assert.equal(figs.potentialProfit, 30000);
});

test('zero manual cost uses the recipe, not the sale price', function () {
  const ctx = {
    mats: [],
    recByPid: {
      1: [
        { qty: 2, line_amount: 4000, price: 99999, name: 'komir', unit: 'kg' },
        { qty: 1, line_amount: null, price: 500, name: 'paket', unit: 'dona' }
      ]
    },
    wageByPid: { 1: 700 }
  };
  const row = { id: 1, sku: '1kg Starter', weight_kg: 1, cost_price: 0, price: 12000 };
  const cost = stockCost.unitCostFor(row, ctx);
  assert.equal(cost.cost_computed, 4500);
  assert.equal(cost.unit_cost, 4500);
  const figs = stockCost.figures(row.price, cost.unit_cost, 8);
  assert.equal(figs.margin, 7500);
  assert.equal(figs.potentialProfit, 60000);
  assert.equal(figs.costValue, 36000);
});

test('product payload keeps the manual cost_price and adds resolved tannarx', function () {
  const ctx = {
    mats: [{ id: 1, name: "ko'mir", unit: 'qop', price: 27000 }],
    recByPid: {},
    wageByPid: {}
  };
  const row = { id: 5, sku: '1kg Oddiy', weight_kg: 1, price: 9000, cost_price: 0 };
  const out = stockCost.attachProductCost(row, ctx);
  assert.equal(out.cost_price, 0);
  assert.ok(out.unit_cost > 0);
  assert.equal(out.profit_unit, 9000 - out.unit_cost);
  assert.notEqual(out.unit_cost, out.profit_unit);
});

test('admin stock headers bind tannarx to cost and foyda to sale minus cost', function () {
  const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
  const stockStart = html.indexOf("Tayyor mahsulot qoldig'i");
  const stockEnd = html.indexOf('function Products');
  const stock = html.slice(stockStart, stockEnd);
  assert.match(stock, /const prof = line\.prof/);
  assert.match(stock, /data-label="Tannarx">\{money\(cost\)\}/);
  assert.match(stock, /data-label="Foyda\/dona">\{money\(prof\)\}/);
  assert.match(stock, /data-label="Ombor tannarx">\{money\(cval\)\}/);
  assert.match(stock, /data-label="Ombor savdo">\{money\(line\.sval\)\}/);
  assert.match(stock, /data-label="Kutilgan foyda"/);
  const helper = html.slice(html.indexOf('function stockLine'), html.indexOf('function mijozNarx'));
  assert.match(helper, /const prof = Math\.round\(sale - cost\)/);
  assert.match(helper, /cval: Math\.round\(qty \* cost\)/);
  assert.match(helper, /pval: Math\.round\(qty \* prof\)/);
  const productsStart = html.indexOf('function Products');
  const productsEnd = html.indexOf('function Materials');
  const products = html.slice(productsStart, productsEnd);
  assert.match(products, /data-label="Tannarx">\{money\(p\.unit_cost != null \? p\.unit_cost : p\.cost_price\)\}/);
  assert.match(products, /data-label="Foyda">\{money\(Math\.round\(Number\(p\.price \|\| 0\) - Number\(p\.unit_cost != null \? p\.unit_cost : p\.cost_price \|\| 0\)\)\)\}/);
});
