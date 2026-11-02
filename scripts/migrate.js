/**
 * Migratsiya. Sukutda faqat reja, yozmaydi.
 * DATABASE_URL bo'lsa faqat o'qiydi va "allaqachon bor" / "qo'llanmagan" deb belgilaydi.
 * Yozish: node scripts/migrate.js --apply  (hozircha productionda ishlatilmaydi)
 */
require('dotenv').config();
const { Pool } = require('pg');
const { plan, classify } = require('../lib/migrate');

const root = require('path').join(__dirname, '..');
const apply = process.argv.indexOf('--apply') !== -1;
const url = (process.env.DATABASE_URL || '').trim();

async function main() {
  if (!url) {
    const files = plan(root);
    console.log('Baza ulanmagan. Fayl rejasi (' + files.length + '):');
    files.forEach((file) => console.log('  ' + (file.ok ? 'OK' : 'RAD') + '  ' + file.name + '  — baza ulanmagan'));
    console.log('Deploy: npm start migratsiya ishlatmaydi. --apply hozircha productionda yoqilmagan.');
    process.exit(files.every((file) => file.ok) ? 0 : 1);
  }
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const files = await classify(pool, root);
    console.log('Migratsiya holati:');
    files.forEach((file) => {
      console.log('  ' + file.status.padEnd(16) + file.name);
    });
    if (!apply) {
      console.log('Yozilmadi. npm start migratsiya ishlatmaydi. --apply hozircha productionda yoqilmagan.');
      return;
    }
    console.error('--apply hozircha productionda ishlatilmaydi. Alohida ruxsat kerak.');
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
