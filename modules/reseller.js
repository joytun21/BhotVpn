const db = require('../database'); 
const { bot, adminIds, GROUP_ID } = require('../core');
const logger = require('../logger');

function prosesResellerTransaksi(ctx, user, harga, exp, type, username) {
  return new Promise((resolve) => {
    let diskon = 0.1;
    if (user.reseller_level === 'gold') diskon = 0.2;
    else if (user.reseller_level === 'platinum') diskon = 0.3;

    const hargaSatuan = Math.floor(harga * (1 - diskon));
    const komisi = Math.floor(hargaSatuan * exp * 0.1);

    // Update saldo reseller
    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [komisi, ctx.from.id]);

    // Insert transaksi
    db.run('INSERT INTO reseller_sales (reseller_id, buyer_id, akun_type, username, komisi, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      [ctx.from.id, ctx.from.id, type, username, komisi]);

    // Notifikasi reseller
    ctx.reply(
      `🎁 *Diskon ${Math.floor(diskon * 100)}%* (${user.reseller_level?.toUpperCase() || 'SILVER'})\n` +
      `💸 Komisi masuk: *Rp${komisi}*`,
      { parse_mode: 'Markdown' }
    );

    // Kirim notif ke admin
    const resellerMention = ctx.from.username
      ? `@${ctx.from.username}`
      : ctx.from.first_name;

    const notif = `👤 User: ${resellerMention}\n` +
                  `📦 Akun: ${type.toUpperCase()} - ${username}\n` +
                  `💰 Komisi: Rp${komisi}`;

    for (const adminId of adminIds) {
      bot.telegram.sendMessage(adminId, notif, { parse_mode: 'Markdown' }).catch(e => {
        logger.warn(`❌ Gagal kirim notif ke admin ${adminId}: ${e.message}`);
      });
    }

    // Kirim juga ke grup
    bot.telegram.sendMessage(GROUP_ID, notif, { parse_mode: 'Markdown' }).catch(e => {
      logger.warn(`❌ Gagal kirim notif ke grup: ${e.message}`);
    });

    // Update level reseller
    db.get('SELECT SUM(komisi) AS total_komisi FROM reseller_sales WHERE reseller_id = ?', [ctx.from.id], (err, result) => {
      if (!result) return;
      let level = 'silver';
      if (result.total_komisi >= 250000) level = 'platinum';
      else if (result.total_komisi >= 50000) level = 'gold';
      db.run('UPDATE users SET reseller_level = ? WHERE user_id = ?', [level, ctx.from.id]);
    });

    resolve({ hargaSatuan });
  });
}

module.exports = { prosesResellerTransaksi };