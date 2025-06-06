// modules/reseller.js
const db = require('../database'); // pastikan path ke db sesuai
const { bot, adminIds } = require('../core'); // asumsi bot dan adminIds global

function calculateDiskon(level = 'silver') {
  switch (level.toLowerCase()) {
    case 'gold': return 0.2;
    case 'platinum': return 0.3;
    default: return 0.1;
  }
}

function calculateKomisi(hargaSatuan, exp) {
  return Math.floor(hargaSatuan * exp * 0.1);
}

function kirimNotifAdmin(ctx, type, username, komisi) {
  const resellerMention = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name;

  const notif = `🛒 *Reseller Jual Akun!*
👤 User: ${resellerMention}
📦 Akun: ${type.toUpperCase()} - ${username}
💰 Komisi: Rp${komisi}`;

  for (const adminId of adminIds) {
    bot.telegram.sendMessage(adminId, notif, { parse_mode: 'Markdown' }).catch((e) => {
      console.warn(`Gagal kirim notif ke admin ${adminId}:`, e.message);
    });
  }
}

function prosesResellerTransaksi(ctx, user, serverHarga, exp, type, username) {
  return new Promise((resolve, reject) => {
    const diskon = calculateDiskon(user.reseller_level);
    const hargaSatuan = Math.floor(serverHarga * (1 - diskon));
    const komisi = calculateKomisi(hargaSatuan, exp);

    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [komisi, ctx.from.id]);
    db.run(
      'INSERT INTO reseller_sales (reseller_id, buyer_id, akun_type, username, komisi, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      [ctx.from.id, ctx.from.id, type, username, komisi]
    );

    kirimNotifAdmin(ctx, type, username, komisi);

    // Update level reseller
    db.get('SELECT SUM(komisi) AS total_komisi FROM reseller_sales WHERE reseller_id = ?', [ctx.from.id], (err, result) => {
      if (err || !result) return resolve({ hargaSatuan });
      let level = 'silver';
      if (result.total_komisi >= 250000) level = 'platinum';
      else if (result.total_komisi >= 50000) level = 'gold';
      db.run('UPDATE users SET reseller_level = ? WHERE user_id = ?', [level, ctx.from.id]);
      resolve({ hargaSatuan });
    });
  });
}

module.exports = {
  calculateDiskon,
  calculateKomisi,
  kirimNotifAdmin,
  prosesResellerTransaksi
};
