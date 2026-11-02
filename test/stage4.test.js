const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildUlushView } = require('../lib/yuk-ulush');

describe('4. Ulush', () => {
  it('YX-LEG- va legacy to\'lov ulushga kirmaydi. Ulush = stavka × dona', () => {
    const real = {
      id: 1,
      waybill_code: 'YX-20261025-000019',
      sale_date: '2026-10-25',
      total_amount: 916000,
      paid_amount: 916000,
      debt_amount: 0,
      potential: 500 * 16 + 0 * 14 + 300 * 12,
      legacy_source: null,
    };
    const legacyBill = {
      id: 2,
      waybill_code: 'YX-LEG-19',
      sale_date: '2026-10-20',
      total_amount: 200000,
      paid_amount: 200000,
      debt_amount: 0,
      potential: 1000 * 20,
      legacy_source: 'briket-mini-app',
    };
    const oldAlloc = {
      id: 9,
      waybill_id: 1,
      amount: 100000,
      created_at: '2026-10-23T10:00:00+05:00',
      legacy_source: 'briket-mini-app',
    };
    const newAlloc = {
      id: 10,
      waybill_id: 1,
      amount: 916000,
      created_at: '2026-10-25T12:00:00+05:00',
      legacy_source: null,
    };
    assert.equal(real.potential, 11600);

    const before = buildUlushView({
      today: '2026-10-31',
      enabledOn: '2020-01-01',
      waybills: [real, legacyBill],
      allocations: [oldAlloc, newAlloc],
    });
    const after = before;
    assert.equal(after.yigilgan, 11600);
    assert.equal(after.ochilmagan, 0);

    const unfilteredPotential = real.potential + legacyBill.potential;
    assert.equal(unfilteredPotential, 31600);
    assert.equal(unfilteredPotential - after.yigilgan, 20000);
  });

  it('830 611 dagi eski ulush test ma\'lumotida qancha tushishini ko\'rsatadi', () => {
    const productionOld = 830611;
    const legacyFrom2310 = 120000;
    const real = productionOld - legacyFrom2310;
    const view = buildUlushView({
      today: '2026-10-31',
      enabledOn: '2020-01-01',
      waybills: [
        {
          id: 1,
          waybill_code: 'YX-20261025-1',
          sale_date: '2026-10-25',
          total_amount: real,
          paid_amount: real,
          debt_amount: 0,
          potential: real,
        },
        {
          id: 2,
          waybill_code: 'YX-LEG-2310',
          sale_date: '2026-10-23',
          total_amount: legacyFrom2310,
          paid_amount: legacyFrom2310,
          debt_amount: 0,
          potential: legacyFrom2310,
          legacy_source: 'import-2026-10-23',
        },
      ],
      allocations: [],
    });
    assert.equal(productionOld, 830611);
    assert.equal(view.yigilgan, 710611);
    assert.equal(productionOld - view.yigilgan, 120000);
  });
});
