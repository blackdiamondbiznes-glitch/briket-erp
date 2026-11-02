const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const match = require('../lib/import-match');

const src = fs.readFileSync(path.join(__dirname, '../scripts/import-mini-app.js'), 'utf8');

const ERP_COLUMNS = {
  products: [
    'id', 'sku', 'weight_kg', 'price', 'description', 'image_urls', 'is_active',
    'note', 'created_at', 'updated_at', 'cost_price', 'yuk_unit_commission',
  ],
  customers: [
    'id', 'name', 'phone', 'address', 'credit_limit', 'telegram_id', 'note',
    'is_active', 'created_at', 'updated_at', 'agent_id', 'latitude', 'longitude',
    'legacy_source', 'legacy_id',
  ],
  waybills: [
    'id', 'waybill_code', 'agent_id', 'customer_id', 'order_id', 'total_amount',
    'paid_amount', 'debt_amount', 'commission_amount', 'due_date', 'status', 'note',
    'idempotency_key', 'stock_posted', 'legacy_source', 'legacy_id', 'created_at',
    'updated_at', 'sale_date', 'reys_id', 'request_id',
    'created_by_telegram_id', 'created_by_first_name', 'created_by_last_name',
    'created_by_username',
  ],
  waybill_items: [
    'id', 'waybill_id', 'product_id', 'product_name', 'quantity', 'price',
    'subtotal', 'commission', 'legacy_source', 'legacy_id',
  ],
  payments: [
    'id', 'order_id', 'partner_id', 'customer_id', 'amount', 'method', 'note',
    'paid_at', 'created_at', 'request_id', 'reverses_payment_id', 'kind',
    'legacy_source', 'created_by_telegram_id', 'created_by_first_name',
    'created_by_last_name', 'created_by_username',
  ],
  agents: [
    'id', 'telegram_id', 'telegram_username', 'full_name', 'email', 'role',
    'access_status', 'commission_enabled_on', 'is_active', 'legacy_source',
    'legacy_id', 'created_at', 'updated_at',
  ],
  agent_access_requests: [
    'id', 'telegram_id', 'telegram_username', 'full_name', 'status',
    'notify_message_id', 'decided_at', 'decided_by', 'legacy_source', 'legacy_id',
    'created_at',
  ],
  agent_debt_payments: [
    'id', 'agent_id', 'customer_id', 'amount', 'notes', 'applied_to_waybills',
    'legacy_source', 'legacy_id', 'created_at',
  ],
  agent_commission_events: [
    'id', 'agent_id', 'customer_id', 'waybill_id', 'debt_payment_id', 'amount',
    'source', 'legacy_source', 'legacy_id', 'created_at',
  ],
  agent_commission_withdrawals: [
    'id', 'agent_id', 'amount', 'notes', 'legacy_source', 'legacy_id', 'created_at',
  ],
  customer_map: ['id', 'legacy_uuid', 'customer_id', 'agent_id', 'legacy_source', 'created_at'],
  product_map: ['id', 'legacy_uuid', 'product_id', 'agent_id', 'legacy_source', 'created_at'],
};

function erpSql(text) {
  const from = text.indexOf('async function findWaybill');
  const mini = text.indexOf('async function readMini');
  const read = text.indexOf('async function readErp');
  const after = text.indexOf('function loadLinks');
  return text.slice(from, mini) + '\n' + text.slice(read, after);
}

function sqlStrings(chunk) {
  const out = [];
  const re = /`([^`]*)`|'((?:\\'|[^'])*)'/g;
  let m;
  while ((m = re.exec(chunk))) {
    const body = (m[1] != null ? m[1] : m[2].replace(/\\'/g, "'")).trim();
    if (/\b(FROM|INSERT\s+INTO)\b/i.test(body)) out.push(body);
  }
  return out;
}

function usedColumns(sql) {
  const inserted = sql.match(/INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)/i);
  if (inserted) {
    return {
      table: inserted[1],
      cols: inserted[2].split(',').map((s) => s.trim()).filter(Boolean),
    };
  }
  const selected = sql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+([a-z_]+)/i);
  if (!selected) return null;
  const cols = selected[1].split(',').map((part) => {
    return part.trim().split(/\s+/).pop().replace(/[^a-z0-9_]/gi, '');
  }).filter(Boolean);
  const where = (sql.split(/WHERE/i)[1] || '');
  const wr = /([a-z_][a-z0-9_]*)\s*(=|IS\b)/gi;
  let w;
  while ((w = wr.exec(where))) cols.push(w[1]);
  return { table: selected[2], cols: cols };
}

test('ERP product match uses sku and the read query has no products.name', () => {
  const mini = {
    profiles: [],
    stores: [],
    orders: [],
    debt_payments: [],
    access_requests: [],
    products: [
      { id: 'a', owner_id: 'p', name: '1kg Oddiy' },
      { id: 'b', owner_id: 'p', name: 'Boshqa' },
    ],
  };
  const plan = match.buildImportPlan(mini, {
    customers: [],
    products: [
      { id: 8, sku: '1kg Oddiy' },
      { id: 9, sku: 'boshqa-sku' },
    ],
  }, {});
  assert.equal(plan.actions.some((a) => a.type === 'link_product' && a.legacy_id === 'a' && a.product_id === 8 && a.via === 'sku'), true);
  assert.equal(plan.actions.some((a) => a.type === 'skip_product' && a.legacy_id === 'b'), true);

  const namedOnly = match.buildImportPlan(mini, {
    customers: [],
    products: [{ id: 8, name: '1kg Oddiy' }],
  }, {});
  assert.equal(namedOnly.actions.some((a) => a.type === 'link_product'), false);

  assert.match(src, /SELECT id, sku FROM products/);
  assert.doesNotMatch(src, /sku,\s*name FROM products/);
});

test('every ERP query column exists on the production tables', () => {
  const found = sqlStrings(erpSql(src)).map(usedColumns).filter(Boolean);
  assert.ok(found.length > 0);
  const bad = [];
  found.forEach((row) => {
    const allowed = ERP_COLUMNS[row.table];
    if (!allowed) {
      bad.push(row.table + ': jadval ro\'yxatda yo\'q');
      return;
    }
    row.cols.forEach((col) => {
      if (allowed.indexOf(col) === -1) bad.push(row.table + '.' + col);
    });
  });
  assert.deepEqual(bad, []);
  assert.equal(ERP_COLUMNS.products.indexOf('name'), -1);
  assert.ok(found.some((row) => row.table === 'products' && row.cols.indexOf('sku') !== -1));
  assert.ok(found.some((row) => row.table === 'customers' && row.cols.indexOf('legacy_id') !== -1));
});
