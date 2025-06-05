// modules/reseller/tambah.js
module.exports = (bot, db, adminIds) => {
  const resellerState = {};

  const isAdmin = (id) => adminIds.includes(id);

  bot.action('add_reseller', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) return ctx.reply('❌ Akses ditolak. Hanya admin.');

    resellerState[userId] = { step: 'awaiting_user_id' };
    ctx.reply('🆔 Masukkan *User ID Telegram* yang ingin dijadikan reseller:', {
      parse_mode: 'Markdown'
    });
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = resellerState[userId];
    if (!state || state.step !== 'awaiting_user_id') return;

    const input = ctx.message.text.trim();
    const resellerId = parseInt(input);
    if (isNaN(resellerId)) return ctx.reply('⚠️ Format ID tidak valid.');

    db.run('INSERT OR IGNORE INTO reseller_users (user_id, saldo) VALUES (?, 0)', [resellerId], (err) => {
      if (err) {
        console.error('❌ DB error:', err.message);
        return ctx.reply('❌ Gagal menambah reseller.');
      }
      ctx.reply(`✅ Reseller dengan ID ${resellerId} berhasil ditambahkan.`);
    });

    delete resellerState[userId];
  });
};