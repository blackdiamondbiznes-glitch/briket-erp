/**
 * Idempotent migratsiya rejasi.
 * Productionga o'zi yozmaydi. Jadval/ustun o'chirish, TRUNCATE va DELETE rad etiladi.
 * Qo'llangan migratsiya jurnal yoki mavjud jadval/ustun orqali "allaqachon bor" bo'ladi.
 */
const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b[^;]*\bRENAME\b/i,
  /\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i,
];

const FINGERPRINTS = {
  '004_agent_field_sales': { table: 'agents' },
  '005_admin_waybills': { table: 'waybills', column: 'stock_posted' },
  '006_reys': { table: 'reyslar' },
  '007_yuk_xati': { table: 'payment_allocations' },
  '008_yuk_creator': { table: 'waybills', column: 'created_by_telegram_id' },
  '009_yuk_access': { table: 'yuk_access_requests' },
  '010_yuk_admin_creator': { table: 'waybills', column: 'created_by_telegram_id' },
  '011_yuk_ulush': { table: 'yuk_commission_withdrawals' },
  '012_settings_sack_wage': { table: 'settings', setting: 'sack_kg' },
  '013_payments_legacy': { table: 'payments', column: 'legacy_source' },
};

function migrationDir(root) {
  return path.join(root, 'migrations');
}

function listMigrationFiles(root) {
  const dir = migrationDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d+.+\.sql$/i.test(name))
    .sort()
    .map((name) => ({
      id: name.replace(/\.sql$/i, ''),
      name: name,
      path: path.join(dir, name),
    }));
}

function inspectSql(sql) {
  const text = String(sql || '');
  const hits = [];
  FORBIDDEN.forEach((re) => {
    if (re.test(text)) hits.push(re.source);
  });
  return { ok: hits.length === 0, hits: hits };
}

function plan(root) {
  return listMigrationFiles(root).map((file) => {
    const sql = fs.readFileSync(file.path, 'utf8');
    const check = inspectSql(sql);
    return {
      id: file.id,
      name: file.name,
      path: file.path,
      ok: check.ok,
      hits: check.hits,
      bytes: Buffer.byteLength(sql),
      status: 'baza ulanmagan',
    };
  });
}

async function journalIds(client) {
  const exists = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
  `);
  if (!exists.rows.length) return new Set();
  const rows = await client.query('SELECT id FROM schema_migrations');
  return new Set(rows.rows.map((row) => row.id));
}

async function fingerprintPresent(client, id) {
  const mark = FINGERPRINTS[id];
  if (!mark) return false;
  if (mark.setting) {
    const rows = await client.query('SELECT 1 FROM settings WHERE key = $1', [mark.setting]);
    return rows.rows.length > 0;
  }
  if (mark.column) {
    const rows = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [mark.table, mark.column]
    );
    return rows.rows.length > 0;
  }
  const rows = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [mark.table]
  );
  return rows.rows.length > 0;
}

async function classify(client, root) {
  const files = plan(root);
  const journal = await journalIds(client);
  const out = [];
  for (const file of files) {
    let status = 'qo\'llanmagan';
    if (journal.has(file.id)) status = 'jurnalda';
    else if (await fingerprintPresent(client, file.id)) status = 'allaqachon bor';
    out.push(Object.assign({}, file, { status: status }));
  }
  return out;
}

async function ensureTracker(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyPending(client, root) {
  const files = await classify(client, root);
  const blocked = files.filter((file) => !file.ok);
  if (blocked.length) {
    throw new Error('Xavfli migratsiya rad etildi: ' + blocked.map((file) => file.name).join(', '));
  }
  await ensureTracker(client);
  const applied = [];
  for (const file of files) {
    if (file.status !== 'qo\'llanmagan') continue;
    const sql = fs.readFileSync(file.path, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [file.id]);
      await client.query('COMMIT');
      applied.push(file.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return { applied: applied, skipped: files.length - applied.length, files: files };
}

module.exports = {
  listMigrationFiles: listMigrationFiles,
  inspectSql: inspectSql,
  plan: plan,
  classify: classify,
  applyPending: applyPending,
  FINGERPRINTS: FINGERPRINTS,
};
