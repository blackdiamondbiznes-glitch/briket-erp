require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ================= POSTGRESQL (Supabase) =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false } // Supabase uchun kerak
    : false
});

// Ulanishni tekshirish (server ishga tushganda)
pool.query('SELECT NOW() AS now')
  .then((res) => {
    console.log('✅ PostgreSQL ulandi:', res.rows[0].now);
  })
  .catch((err) => {
    console.error('❌ PostgreSQL ulanish xatosi:', err.message);
  });

// ================= ENDPOINTS =================

// Asosiy test
app.get('/', (req, res) => {
  res.json({
    message: 'Briket ERP API ishlayapti!',
    time: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Ma'lumotlar bazasi holati
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS db_time, current_database() AS db_name');
    res.json({
      ok: true,
      server_time: new Date().toISOString(),
      db_time: result.rows[0].db_time,
      database: result.rows[0].db_name
    });
  } catch (err) {
    console.error('Health check xato:', err.message);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// ================= SERVER =================
app.listen(PORT, () => {
  console.log(`Server ${PORT} portda ishga tushdi`);
});