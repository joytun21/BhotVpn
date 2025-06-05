// modules/reseller/logic/list.js
module.exports = (bot, db, adminIds) => {
  bot.action('list_reseller', async (ctx) => {
    const userId = ctx.from.id;

    if (!adminIds.includes(userId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa melihat daftar reseller.');
    }

    db.all('SELECT user_id, saldo FROM reseller_users', (err, rows) => {
      if (err) {
        console.error('❌ Gagal mengambil data reseller:', err.message);
        return ctx.reply('❌ Gagal mengambil daftar reseller.');
      }

      if (rows.length === 0) {
        return ctx.reply('📭 Belum ada reseller terdaftar.');
      }

      const text = rows.map((r, i) => `#${i + 1} 🧑‍💻 ID: \`${r.user_id}\` — 💰 Saldo: Rp${r.saldo}`).join('\n\n');

      ctx.reply(`📋 *Daftar Reseller:*\n\n${text}`, {
        parse_mode: 'Markdown'
      });
    });
  });
};