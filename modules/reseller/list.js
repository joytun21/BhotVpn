// modules/reseller/list.js
module.exports = (bot, db, adminIds) => {
  const isAdmin = (id) => adminIds.includes(id);

  bot.action('list_reseller', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) return ctx.reply('❌ Akses ditolak.');

    db.all('SELECT * FROM reseller_users', [], (err, rows) => {
      if (err || !rows.length) return ctx.reply('❌ Tidak ada reseller.');
      const list = rows.map((r, i) => `#${i + 1} 👤 ${r.user_id} — 💰 Rp${r.saldo}`).join('\n');
      ctx.reply(`📋 *Daftar Reseller:*\n\n${list}`, { parse_mode: 'Markdown' });
    });
  });
};