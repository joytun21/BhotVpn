// modules/reseller/hapus.js
module.exports = (bot, db, adminIds) => {
  const isAdmin = (id) => adminIds.includes(id);

  bot.action('delete_reseller', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) return ctx.reply('❌ Akses ditolak.');

    ctx.reply('🆔 Masukkan ID reseller yang ingin dihapus:');
    bot.once('text', (ctx2) => {
      const targetId = ctx2.message.text.trim();
      db.run('DELETE FROM reseller_users WHERE user_id = ?', [targetId], (err) => {
        if (err) return ctx2.reply('❌ Gagal hapus reseller.');
        ctx2.reply(`✅ Reseller ${targetId} berhasil dihapus.`);
      });
    });
  });
};