const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Lokasi DB file
const dbPath = path.join(__dirname, '..', 'sellvpn.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Gagal koneksi ke database:', err.message);
  } else {
    console.log('✅ Terhubung ke database SQLite.');
  }
});

// ⛏️ Bootstrap table jika belum ada
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    role TEXT DEFAULT 'user',
    saldo INTEGER DEFAULT 0,
    reseller_level TEXT DEFAULT 'silver'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS reseller_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reseller_id INTEGER,
    buyer_id INTEGER,
    akun_type TEXT,
    username TEXT,
    komisi INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;