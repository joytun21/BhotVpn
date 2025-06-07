const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Lokasi file database
const dbPath = path.resolve(__dirname, '../sellvpn.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Gagal koneksi ke database:', err.message);
  } else {
    console.log('Database terkoneksi:', dbPath);
  }
});

// Contoh fungsi ambil data user berdasarkan ID Telegram
function getUserById(userId, callback) {
  db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, row) => {
    if (err) {
      console.error('Query gagal:', err.message);
      callback(null);
    } else {
      callback(row);
    }
  });
}

// Contoh fungsi simpan user
function saveUser(user, callback) {
  const { telegram_id, username, role } = user;
  db.run(
    'INSERT INTO users (telegram_id, username, role) VALUES (?, ?, ?)',
    [telegram_id, username, role],
    function (err) {
      if (err) {
        console.error('Gagal simpan user:', err.message);
        callback(false);
      } else {
        callback(true);
      }
    }
  );
}

module.exports = {
  db,
  getUserById,
  saveUser,
};