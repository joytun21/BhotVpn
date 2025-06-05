// modules/reseller/actions/list.js
module.exports = (bot, db, adminIds) => {
  bot.action('list_reseller', async (ctx) => {
    const userId = ctx.from.id;
    if (!adminIds.includes(userId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa melihat daftar reseller.');
    }

    db.all('SELECT user_id, saldo FROM reseller_users', [], (err, rows) => {
      if (err) {
        console.error('❌ Error ambil reseller:', err.message);
        return ctx.reply('❌ Gagal mengambil data reseller.');
      }

      if (rows.length === 0) {
        return ctx.reply('📭 Belum ada reseller terdaftar.');
      }

      let list = rows.map((row, i) => 
        `#${i+1} 🧑‍💻 *ID:* \`${row.user_id}\`\n💰 Saldo: *Rp${row.saldo}*`
      ).join('\n\n');

      ctx.reply(`📋 *Daftar Reseller:*\n\n${list}`, { parse_mode: 'Markdown' });
    });
  });
};