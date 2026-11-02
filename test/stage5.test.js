const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildShareHtml } = require('../lib/nakladnoy');

describe('5. Nakladnoy', () => {
  it('eski format, karta code ichida', () => {
    const text = buildShareHtml({
      display_no: 19,
      sale_date: '2026-10-25',
      customer_name: 'Toshkent Market',
      due_date: '2026-10-27',
      total_amount: 916000,
      paid_amount: 0,
      debt_amount: 916000,
      company_card: '5614682112981388',
      company_card_holder: 'ADHAM HOSHIMOV',
      company_phone: '+998976330330',
      company_telegram: 't.me/Khoshimov_Adkham',
      items: [
        { product_name: '1 kg', price: 14000, quantity: 16, subtotal: 224000 },
        { product_name: '1.5 kg', price: 28000, quantity: 14, subtotal: 392000 },
        { product_name: '2 kg', price: 25000, quantity: 12, subtotal: 300000 },
      ],
    });
    assert.match(text, /^YUK XATI \(NAKLADNOY\) #19/);
    assert.match(text, /Sana: 25\.10\.2026/);
    assert.match(text, /Do'kon: "Toshkent Market"/);
    assert.match(text, /• 1 kg \(14,000 so'm\) x 16 dona = 224,000 so'm/);
    assert.match(text, /Jami: 916,000 so'm/);
    assert.match(text, /Qoldiq qarz: 916,000 so'm/);
    assert.match(text, /<code>5614682112981388<\/code>/);
    assert.match(text, /<code>ADHAM HOSHIMOV<\/code>/);
    assert.match(text, /t\.me\/Khoshimov_Adkham/);
    assert.match(text, /Rahmat! Xaridingiz fayzli bo'lsin!/);
  });
});
