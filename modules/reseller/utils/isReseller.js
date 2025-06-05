// modules/reseller/utils/isReseller.js

function isReseller(db, userId, cb) {
  db.get('SELECT * FROM reseller_users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      console.error('❌ Error checking reseller:', err.message);
      return cb(false);
    }
    cb(!!row); // return true jika data ditemukan
  });
}

module.exports = { isReseller };