/**
 * Ulush hisobi o'qish paytida. Waybill commission_amount ga yozilmaydi.
 * Ochilgan ulush = qator ulushi * to'langan / jami.
 */
const { addDaysYmd, commissionOnCollection, formatDmy, formatSom, som } = require('./agent-money');

function tashkentDate(value) {
  if (value == null || value === '') return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (e) {
    return s.slice(0, 10);
  }
}

function shareOf(potential, already, collected, total, clears) {
  return commissionOnCollection({
    potential: potential,
    alreadyEarned: already,
    collected: collected,
    originalTotal: total,
    allowed: true,
    clearsRemainder: !!clears,
  });
}

function buildEvents(waybills, allocations) {
  const byBill = {};
  (allocations || []).forEach(function (row) {
    const key = String(row.waybill_id);
    if (!byBill[key]) byBill[key] = [];
    byBill[key].push(row);
  });
  const events = [];
  (waybills || []).forEach(function (bill) {
    const potential = som(bill.potential);
    const total = som(bill.total_amount);
    if (!(potential > 0) || !(total > 0)) return;
    const saleDate = tashkentDate(bill.sale_date);
    const rows = (byBill[String(bill.id)] || []).slice().sort(function (a, b) {
      const ta = String(a.created_at || '');
      const tb = String(b.created_at || '');
      if (ta !== tb) return ta < tb ? -1 : 1;
      return Number(a.id || 0) - Number(b.id || 0);
    });
    let earned = 0;
    let seenPositive = false;
    if (!rows.length && som(bill.paid_amount) > 0) {
      const share = shareOf(potential, 0, som(bill.paid_amount), total, som(bill.debt_amount) <= 0);
      if (share !== 0) {
        events.push({
          id: 'wb-' + bill.id,
          waybill_id: bill.id,
          waybill_code: bill.waybill_code,
          customer_id: bill.customer_id,
          customer_name: bill.customer_name || '',
          local_date: saleDate,
          source: 'sale',
          amount: share,
        });
      }
      return;
    }
    let debtLeft = total;
    rows.forEach(function (row) {
      const collected = som(row.amount);
      if (!collected) return;
      const day = tashkentDate(row.created_at) || saleDate;
      if (collected > 0) {
        debtLeft = Math.max(0, debtLeft - collected);
        const share = shareOf(potential, earned, collected, total, debtLeft === 0);
        const source = !seenPositive && day === saleDate ? 'sale' : 'debt_payment';
        seenPositive = true;
        if (!share) return;
        earned += share;
        events.push({
          id: 'al-' + (row.id || row.payment_id || events.length),
          waybill_id: bill.id,
          waybill_code: bill.waybill_code,
          customer_id: bill.customer_id,
          customer_name: bill.customer_name || '',
          local_date: day,
          source: source,
          amount: share,
        });
        return;
      }
      const back = Math.min(earned, shareOf(potential, 0, Math.abs(collected), total, false));
      if (!back) return;
      earned -= back;
      events.push({
        id: 'rev-' + (row.id || events.length),
        waybill_id: bill.id,
        waybill_code: bill.waybill_code,
        customer_id: bill.customer_id,
        customer_name: bill.customer_name || '',
        local_date: day,
        source: 'sale_edit',
        amount: -back,
      });
    });
  });
  return events;
}

function buildUlushView(input) {
  const today = tashkentDate(input && input.today) || tashkentDate(new Date());
  const enabledOn = tashkentDate(input && input.enabledOn) || today;
  const selected = tashkentDate(input && input.selectedDate) || today;
  const yesterday = addDaysYmd(today, -1);
  const events = buildEvents(input && input.waybills, input && input.allocations);
  const openedAll = events.reduce(function (s, ev) { return s + som(ev.amount); }, 0);
  const potential = (input && input.waybills || []).reduce(function (s, bill) {
    return s + som(bill.potential);
  }, 0);
  const counted = events.filter(function (ev) { return ev.local_date >= enabledOn; });
  const yigilgan = counted.reduce(function (s, ev) { return s + som(ev.amount); }, 0);
  const withdrawals = (input && input.withdrawals || []).map(function (row) {
    return {
      id: row.id,
      amount: som(row.amount),
      note: row.note || '',
      taken_on: tashkentDate(row.taken_on || row.created_at),
      created_at: row.created_at || row.taken_on || '',
    };
  }).filter(function (row) { return row.taken_on >= enabledOn; });
  const olingan = withdrawals.reduce(function (s, row) { return s + row.amount; }, 0);
  const dayEvents = counted.filter(function (ev) { return ev.local_date === selected; });
  return {
    enabled_on: enabledOn,
    today: today,
    selected_date: selected,
    today_total: counted.filter(function (ev) { return ev.local_date === today; })
      .reduce(function (s, ev) { return s + som(ev.amount); }, 0),
    yesterday_total: counted.filter(function (ev) { return ev.local_date === yesterday; })
      .reduce(function (s, ev) { return s + som(ev.amount); }, 0),
    yigilgan: yigilgan,
    olingan: olingan,
    qoldiq: Math.max(0, yigilgan - olingan),
    ochilmagan: Math.max(0, potential - openedAll),
    day_total: dayEvents.reduce(function (s, ev) { return s + som(ev.amount); }, 0),
    events: dayEvents,
    withdrawals: withdrawals.slice().sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    }).slice(0, 8),
  };
}

function buildDailyDeliveriesText(isoDate, waybills) {
  const lines = [];
  lines.push('Kunlik yuklar — ' + (formatDmy(isoDate) || isoDate));
  lines.push('================================');
  const list = (waybills || []).slice().sort(function (a, b) {
    const na = a.customer_name || '';
    const nb = b.customer_name || '';
    const cmp = na.localeCompare(nb, 'uz');
    if (cmp) return cmp;
    return Number(a.id) - Number(b.id);
  });
  if (!list.length) {
    lines.push('Bu kunda yuk xati yo\'q.');
    return lines.join('\n');
  }
  const byStore = new Map();
  list.forEach(function (row) {
    const key = String(row.customer_id);
    if (!byStore.has(key)) {
      byStore.set(key, { name: row.customer_name || 'Do\'kon', orders: [] });
    }
    byStore.get(key).orders.push(row);
  });
  let storeIdx = 0;
  const productTotals = new Map();
  let grandTotal = 0;
  let grandPaid = 0;
  let grandDebt = 0;
  byStore.forEach(function (group) {
    storeIdx += 1;
    lines.push('');
    lines.push(storeIdx + '. ' + group.name);
    group.orders.forEach(function (row) {
      const total = som(row.total_amount);
      const paid = som(row.paid_amount);
      const debt = som(row.debt_amount);
      grandTotal += total;
      grandPaid += paid;
      grandDebt += debt;
      lines.push('   Yuk xati ' + (row.waybill_code || row.id) + ' · ' + formatSom(total) + ' so\'m');
      lines.push('   To\'landi: ' + formatSom(paid) + ' · Qarz: ' + formatSom(debt));
      (row.items || []).forEach(function (it) {
        const name = it.product_name || 'Mahsulot';
        const qty = Number(it.quantity) || 0;
        const sub = som(it.subtotal != null ? it.subtotal : qty * som(it.price));
        lines.push('   • ' + name + ' × ' + qty + ' = ' + formatSom(sub) + ' so\'m');
        const prev = productTotals.get(name) || { qty: 0, sum: 0 };
        productTotals.set(name, { qty: prev.qty + qty, sum: prev.sum + sub });
      });
    });
  });
  lines.push('');
  lines.push('--------------------------------');
  lines.push('Do\'konlar: ' + byStore.size);
  lines.push('Yuk xatlari: ' + list.length);
  lines.push('Jami to\'langan: ' + formatSom(grandPaid) + ' so\'m');
  lines.push('Jami qarz: ' + formatSom(grandDebt) + ' so\'m');
  lines.push('Umumiy summa: ' + formatSom(grandTotal) + ' so\'m');
  if (productTotals.size) {
    lines.push('');
    lines.push('Mahsulotlar jami:');
    Array.from(productTotals.entries()).sort(function (a, b) {
      return a[0].localeCompare(b[0], 'uz');
    }).forEach(function (pair) {
      lines.push('• ' + pair[0] + ': ' + pair[1].qty + ' dona · ' + formatSom(pair[1].sum) + ' so\'m');
    });
  }
  return lines.join('\n');
}

module.exports = {
  tashkentDate: tashkentDate,
  buildEvents: buildEvents,
  buildUlushView: buildUlushView,
  buildDailyDeliveriesText: buildDailyDeliveriesText,
};
