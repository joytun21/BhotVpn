// modules/reseller/actions/hapus.js
module.exports = (bot, db, adminIds) => {
  const hapusState = {};

  bot.action('delete_reseller', async (ctx) => {
    const adminId = ctx.from.id;

    if (!adminIds.includes(adminId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa menghapus reseller.');
    }

    hapusState[adminId] = { step: 'await_reseller_id' };
    ctx.reply('🗑️ Masukkan *User ID Telegram* reseller yang ingin dihapus:', {
      parse_mode: 'Markdown'
    });
  });

  bot.on('text', async (ctx) => {
    const adminId = ctx.from.id;
    const state = hapusState[adminId];
    if (!state) return;

    const input = ctx.message.text.trim();

    if (!/^\d+$/.test(input)) {
      return ctx.reply('⚠️ Format ID tidak valid. Masukkan angka saja.');
    }

    db.run('DELETE FROM reseller_users WHERE user_id = ?', [input], function (err) {
      if (err) {
        console.error('❌ Gagal hapus reseller:', err.message);
        return ctx.reply('❌ Gagal menghapus reseller.');
      }

      if (this.changes === 0) {
        return ctx.reply('⚠️ Reseller tidak ditemukan.');
      }

      ctx.reply(`✅ Reseller dengan ID ${input} berhasil dihapus.`);
      delete hapusState[adminId];
    });
  });
};