// modules/reseller/utils/isReseller.js
function isReseller(db, userId, callback) {
  db.get('SELECT * FROM reseller_users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      console.error('[❌] DB Error saat cek reseller:', err.message);
      return callback(false);
    }
    callback(!!row);
  });
}

module.exports = { isReseller };