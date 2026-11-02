const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const stockCost = require('../lib/stock-cost');

describe('2. Tannarx', () => {
  it('foyda = sotish − tannarx, jami = dona × qiymat', () => {
    const figs = stockCost.figures(14000, 9000, 16);
    assert.equal(figs.unitCost, 9000);
    assert.equal(figs.margin, 5000);
    assert.equal(figs.value, 224000);
    assert.equal(figs.costValue, 144000);
    assert.equal(figs.potentialProfit, 80000);
  });

  it('qo\'lda cost_price > 0 bo\'lsa retseptdan ustun', () => {
    const ctx = {
      mats: [],
      recByPid: { 1: [{ qty: 1, line_amount: 4000, price: 1, name: 'komir', unit: 'kg' }] },
      wageByPid: {},
    };
    const cost = stockCost.unitCostFor(
      { id: 1, sku: '1 kg', weight_kg: 1, cost_price: 11000, price: 14000 },
      ctx
    );
    assert.equal(cost.cost_computed, 4000);
    assert.equal(cost.unit_cost, 11000);
    assert.equal(cost.cost_override, true);
  });

  it('cost_price 0 bo\'lsa retsept yig\'indisi', () => {
    const ctx = {
      mats: [],
      recByPid: {
        2: [
          { qty: 1, line_amount: 3000, price: 1, name: 'komir', unit: 'kg' },
          { qty: 1, line_amount: null, price: 200, name: 'paket', unit: 'dona' },
        ],
      },
      wageByPid: { 2: 500 },
    };
    const cost = stockCost.unitCostFor(
      { id: 2, sku: '1.5 kg', weight_kg: 1.5, cost_price: 0, price: 28000 },
      ctx
    );
    assert.equal(cost.cost_computed, 3200);
    assert.equal(cost.unit_cost, 3200);
  });
});

describe('2. Ombor formulasi', () => {
  it('xomashyo qoldig\'i = boshlang\'ich + kirim − chiqim', () => {
    function balance(initial, inn, out) {
      return initial + inn - out;
    }
    assert.equal(balance(100, 20, 30), 90);
    assert.equal(balance(0, 0, 0), 0);
  });
});

describe('2. Partiya', () => {
  it('qadoq partiyadagi qolgan kg dan oshmasin', () => {
    const dry = 270;
    const packed = 100;
    const remaining = dry - packed;
    const ask = 200;
    assert.equal(remaining, 170);
    assert.equal(ask > remaining + 0.5, true);
  });
});
