/**
 * Yuk xati — HTML (Unicode) va oddiy PDF (WinAnsi / Helvetica).
 * Tashqi kutubxonasiz, serverda chiziladi.
 */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
    if (ch === '&') return '&amp;';
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '"') return '&quot;';
    return '&#39;';
  });
}

function fmt(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function ymd(value) {
  if (!value) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(value).slice(0, 10);
}

function comma(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function dmy(value) {
  const iso = ymd(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
}

function displayNo(doc) {
  if (doc && doc.display_no != null && String(doc.display_no).trim() !== '') return String(doc.display_no);
  const code = String((doc && doc.waybill_code) || '');
  const tail = code.match(/(\d+)$/);
  return tail ? String(Number(tail[1])) : code;
}

function buildShareHtml(doc) {
  const items = (doc && doc.items) || [];
  const card = String((doc && doc.company_card) || '').trim();
  const holder = String((doc && doc.company_card_holder) || '').trim();
  const phone = String((doc && doc.company_phone) || '').trim();
  const tg = String((doc && doc.company_telegram) || 't.me/Khoshimov_Adkham').replace(/^https?:\/\//, '');
  const lines = [];
  lines.push('YUK XATI (NAKLADNOY) #' + esc(displayNo(doc)));
  lines.push('Sana: ' + esc(dmy(doc.sale_date || doc.created_at)));
  lines.push('Do\'kon: "' + esc(doc.customer_name || '') + '"');
  lines.push('----------------------------------');
  items.forEach(function (it) {
    lines.push(
      '• ' + esc(it.product_name) +
      ' (' + comma(it.price) + ' so\'m) x ' + esc(it.quantity) +
      ' dona = ' + comma(it.subtotal) + ' so\'m'
    );
  });
  lines.push('----------------------------------');
  lines.push('Jami: ' + comma(doc.total_amount) + ' so\'m');
  lines.push('✅ To\'landi: ' + comma(doc.paid_amount) + ' so\'m');
  lines.push('Qoldiq qarz: ' + comma(doc.debt_amount) + ' so\'m');
  lines.push('Qarzni qaytarish muddati: ' + esc(dmy(doc.due_date)));
  lines.push('----------------------------------');
  lines.push('💳 Karta raqam (nusxa: ustiga bosing):');
  lines.push('<code>' + esc(card) + '</code>');
  lines.push('<code>' + esc(holder) + '</code>');
  lines.push('To\'lov tasdiqlanganligi haqidagi PDF fayli ko\'rsatilsin');
  lines.push('');
  lines.push('📞 ' + esc(phone));
  lines.push('💬 ' + esc(tg));
  lines.push('-----------------------------------');
  lines.push('Rahmat! Xaridingiz fayzli bo\'lsin!');
  return lines.join('\n');
}

function showCommission(doc) {
  if (Math.round(Number(doc && doc.commission_amount) || 0) > 0) return true;
  const items = (doc && doc.items) || [];
  return items.some(function (it) { return Math.round(Number(it.commission) || 0) > 0; });
}

const { creatorLabel } = require('./yuk-creator');

function writerLine(doc) {
  if (doc && doc.agent_name) return 'Agent: ' + doc.agent_name;
  return 'Yozgan: ' + creatorLabel(doc);
}

function renderNakladnoyHtml(doc) {
  const items = (doc && doc.items) || [];
  const withCommission = showCommission(doc);
  const rows = items
    .map(function (it) {
      return (
        '<tr><td>' +
        esc(it.product_name) +
        '</td><td class="num">' +
        esc(it.quantity) +
        '</td><td class="num">' +
        fmt(it.price) +
        '</td><td class="num">' +
        fmt(it.subtotal) +
        (withCommission ? '</td><td class="num">' + fmt(it.commission) : '') +
        '</td></tr>'
      );
    })
    .join('');
  return (
    '<!DOCTYPE html><html lang="uz"><head><meta charset="utf-8">' +
    '<title>Yuk xati ' +
    esc(doc.waybill_code) +
    '</title><style>' +
    'body{font-family:Inter,Arial,sans-serif;color:#1a1408;margin:24px}' +
    'h1{font-size:20px;margin:0 0 4px} table{border-collapse:collapse;width:100%;margin-top:12px}' +
    'th,td{border:1px solid #c4b89a;padding:6px 8px;font-size:13px;text-align:left}' +
    'td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}' +
    '.meta{color:#5c5346;font-size:13px} .tot{margin-top:12px;font-size:14px}' +
    '</style></head><body>' +
    '<h1>Yuk xati</h1>' +
    '<div class="meta">Kod: <b>' +
    esc(doc.waybill_code) +
    '</b> · Sana: ' +
    esc(ymd(doc.created_at)) +
    (doc.due_date ? ' · Muddat: ' + esc(ymd(doc.due_date)) : '') +
    '</div>' +
    '<div class="meta">' +
    esc(writerLine(doc)) +
    '</div>' +
    '<div class="meta">Mijoz: <b>' +
    esc(doc.customer_name || '') +
    '</b>' +
    (doc.customer_phone ? ' · ' + esc(doc.customer_phone) : '') +
    (doc.customer_address ? ' · ' + esc(doc.customer_address) : '') +
    '</div>' +
    '<table><thead><tr><th>Mahsulot</th><th class="num">Dona</th><th class="num">Narx</th>' +
    '<th class="num">Summa</th>' +
    (withCommission ? '<th class="num">Komissiya</th>' : '') +
    '</tr></thead><tbody>' +
    rows +
    '</tbody></table>' +
    '<div class="tot">Jami: <b>' +
    fmt(doc.total_amount) +
    "</b> so'm · To'langan: <b>" +
    fmt(doc.paid_amount) +
    "</b> · Qarz: <b>" +
    fmt(doc.debt_amount) +
    '</b>' +
    (withCommission ? ' · Komissiya: <b>' + fmt(doc.commission_amount) + '</b>' : '') +
    '</div>' +
    (doc.note ? '<p class="meta">Izoh: ' + esc(doc.note) + '</p>' : '') +
    '</body></html>'
  );
}

function winAnsi(value) {
  return String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, function (ch) {
    if (ch === '\u2018' || ch === '\u2019' || ch === '\u02BB' || ch === '\u02BC' || ch === '\u2032') {
      return "'";
    }
    return '?';
  });
}

function pdfEscape(value) {
  return winAnsi(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pages) {
  const objects = [];
  function add(body) {
    objects.push(body);
    return objects.length;
  }
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  pages.forEach(function (lines) {
    const commands = ['BT', '/F1 11 Tf', '14 TL', '40 800 Td'];
    lines.forEach(function (line, idx) {
      if (idx === 0) commands.push('(' + pdfEscape(line) + ') Tj');
      else commands.push('T* (' + pdfEscape(line) + ') Tj');
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const contentId = add('<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream');
    const pageId = add(
      '<< /Type /Page /Parent PAGES /MediaBox [0 0 595 842] /Contents ' +
        contentId +
        ' 0 R /Resources << /Font << /F1 ' +
        fontId +
        ' 0 R >> >> >>'
    );
    pageIds.push(pageId);
  });
  const kids = pageIds.map((id) => id + ' 0 R').join(' ');
  const pagesId = add('<< /Type /Pages /Count ' + pageIds.length + ' /Kids [' + kids + '] >>');
  const catalogId = add('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach(function (obj, i) {
    offsets.push(Buffer.byteLength(body));
    const text = obj.replace('Parent PAGES', 'Parent ' + pagesId + ' 0 R');
    body += i + 1 + ' 0 obj\n' + text + '\nendobj\n';
  });
  const xref = Buffer.byteLength(body);
  body += 'xref\n0 ' + (objects.length + 1) + '\n';
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    body += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  body += 'trailer << /Size ' + (objects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\n';
  body += 'startxref\n' + xref + '\n%%EOF';
  return Buffer.from(body, 'binary');
}

function renderNakladnoyPdf(doc) {
  const items = (doc && doc.items) || [];
  const lines = [
    'YUK XATI (NAKLADNOY) #' + displayNo(doc),
    'Sana: ' + dmy(doc.sale_date || doc.created_at),
    'Do\'kon: "' + (doc.customer_name || '') + '"',
    '----------------------------------',
  ];
  items.forEach(function (it) {
    lines.push('• ' + it.product_name + ' (' + comma(it.price) + ") x " + it.quantity + ' = ' + comma(it.subtotal));
  });
  lines.push('----------------------------------');
  lines.push('Jami: ' + comma(doc.total_amount) + " so'm");
  lines.push("To'landi: " + comma(doc.paid_amount) + " so'm");
  lines.push('Qoldiq qarz: ' + comma(doc.debt_amount) + " so'm");
  lines.push('Muddat: ' + dmy(doc.due_date));
  lines.push('Karta: ' + (doc.company_card || ''));
  lines.push(doc.company_card_holder || '');
  lines.push('Tel: ' + (doc.company_phone || ''));
  const pages = [];
  const per = 42;
  for (let i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
  if (!pages.length) pages.push(['Yuk xati']);
  return buildPdf(pages);
}

module.exports = {
  esc: esc,
  buildShareHtml: buildShareHtml,
  renderNakladnoyHtml: renderNakladnoyHtml,
  renderNakladnoyPdf: renderNakladnoyPdf,
};
