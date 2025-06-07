// modules/groupNotifier.js
const { GROUP_ID, bot } = require('../core'); // ambil langsung dari core.js
const logger = require('../logger');

function kirimNotifGrupTransaksi(ctx, type, username, komisi = 0) {
  const reseller = ctx.from.username
    ? `@${ctx.from.username}`
    : ctx.from.first_name;

  const msg = `📢 *Transaksi Reseller!*\n\n` +
              `👤 Reseller: ${reseller}\n` +
              `📦 Akun: ${type.toUpperCase()} - ${username}\n` +
              `💰 Komisi: Rp${komisi}\n` +
              `🕒 ${new Date().toLocaleString('id-ID')}`;

  bot.telegram.sendMessage(GROUP_ID, msg, {
    parse_mode: 'Markdown'
  }).catch(err => {
    logger.warn(`❌ Gagal kirim notif grup: ${err.message}`);
  });
}

module.exports = { kirimNotifGrupTransaksi };