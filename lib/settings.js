/**
 * Sozlamalar. Qiymat settings jadvalidan. Yo'q bo'lsa fallback.
 * Qattiq biznes raqami kodga yozilmaydi.
 */
const DEFAULTS = {
  sack_kg: 29,
  pack_unit_wage: 700,
};

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function readSetting(client, key) {
  const fallback = DEFAULTS[key];
  try {
    const r = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (!r.rows.length || r.rows[0].value == null || String(r.rows[0].value).trim() === '') {
      return fallback;
    }
    return num(r.rows[0].value, fallback);
  } catch (error) {
    if (error.code === '42P01') return fallback;
    throw error;
  }
}

async function sackKg(client) {
  const n = await readSetting(client, 'sack_kg');
  return n > 0 ? n : DEFAULTS.sack_kg;
}

async function packUnitWage(client) {
  const n = await readSetting(client, 'pack_unit_wage');
  return n >= 0 ? n : DEFAULTS.pack_unit_wage;
}

module.exports = {
  DEFAULTS: DEFAULTS,
  readSetting: readSetting,
  sackKg: sackKg,
  packUnitWage: packUnitWage,
};
