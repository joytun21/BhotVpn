// modules/reseller/logic/hapus.js
module.exports = (bot, db, adminIds) => {
  const resellerState = {};

  const isAdmin = (id) => adminIds.includes(id);

  bot.action('delete_reseller', async (ctx) => {
    const userId = ctx.from.id;

    if (!isAdmin(userId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa menghapus reseller.');
    }

    resellerState[userId] = { step: 'awaiting_reseller_id' };
    ctx.reply('🗑️ Masukkan *User ID* reseller yang ingin dihapus:', {
      parse_mode: 'Markdown'
    });
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = resellerState[userId];
    if (!state || state.step !== 'awaiting_reseller_id') return;

    const targetId = parseInt(ctx.message.text.trim());
    if (isNaN(targetId)) {
      return ctx.reply('❌ ID tidak valid.');
    }

    db.run('DELETE FROM reseller_users WHERE user_id = ?', [targetId], function (err) {
      if (err) {
        console.error('❌ Error saat hapus reseller:', err.message);
        return ctx.reply('❌ Gagal menghapus reseller.');
      }

      if (this.changes === 0) {
        return ctx.reply('⚠️ Reseller tidak ditemukan.');
      }

      ctx.reply(`✅ Reseller dengan ID ${targetId} berhasil dihapus.`);
    });

    delete resellerState[userId];
  });
};