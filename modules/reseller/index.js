// modules/reseller/index.js
module.exports = (bot, db, adminIds) => {
  require('./tambah')(bot, db, adminIds);
  require('./hapus')(bot, db, adminIds);
  require('./list')(bot, db, adminIds);
  require('./saldo')(bot, db, adminIds);
};