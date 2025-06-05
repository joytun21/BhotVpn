// modules/reseller/actions/tambah.js
module.exports = (bot, db, adminIds) => {
  const state = {};

  const isAdmin = (id) => adminIds.includes(id);

  bot.action('add_reseller', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa menambah reseller.');
    }

    state[userId] = { step: 'await_reseller_id' };
    await ctx.reply('📥 Masukkan *User ID* yang ingin dijadikan reseller:', {
      parse_mode: 'Markdown'
    });
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const current = state[userId];

    if (!current || current.step !== 'await_reseller_id') return;

    const input = ctx.message.text.trim();
    const resellerId = parseInt(input);

    if (isNaN(resellerId)) {
      return ctx.reply('⚠️ Format ID tidak valid. Masukkan angka ID Telegram yang benar.');
    }

    db.run('INSERT OR IGNORE INTO reseller_users (user_id, saldo) VALUES (?, 0)', [resellerId], (err) => {
      if (err) {
        console.error('❌ Gagal insert reseller:', err.message);
        return ctx.reply('❌ Gagal menambahkan reseller.');
      }

      ctx.reply(`✅ Reseller *${resellerId}* berhasil ditambahkan.`, { parse_mode: 'Markdown' });
    });

    delete state[userId];
  });
};