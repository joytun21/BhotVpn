// modules/reseller/actions/transferSaldo.js
module.exports = (bot, db) => {
  const state = {};

  bot.action('tambah_saldo_reseller', async (ctx) => {
    const fromId = ctx.from.id;

    const isReseller = require('./utils/isReseller');
    isReseller(db, fromId, (valid) => {
      if (!valid) return ctx.reply('❌ Kamu bukan reseller.');

      state[fromId] = { step: 'await_user_id' };
      ctx.reply('🆔 Kirim *User ID Telegram* yang mau ditransfer saldo:', { parse_mode: 'Markdown' });
    });
  });

  bot.on('text', async (ctx) => {
    const fromId = ctx.from.id;
    if (!state[fromId]) return;

    const step = state[fromId].step;

    if (step === 'await_user_id') {
      const targetId = parseInt(ctx.message.text.trim());
      if (isNaN(targetId)) return ctx.reply('⚠️ ID tidak valid.');

      state[fromId] = { step: 'await_amount', targetId };
      return ctx.reply('💰 Masukkan *jumlah saldo* yang ingin ditransfer:', { parse_mode: 'Markdown' });
    }

    if (step === 'await_amount') {
      const amount = parseInt(ctx.message.text.trim());
      if (isNaN(amount) || amount <= 0) return ctx.reply('⚠️ Jumlah tidak valid.');

      const { targetId } = state[fromId];

      db.serialize(() => {
        db.get('SELECT saldo FROM reseller_users WHERE user_id = ?', [fromId], (err, sender) => {
          if (err || !sender) return ctx.reply('❌ Data reseller tidak ditemukan.');
          if (sender.saldo < amount) return ctx.reply('❌ Saldo tidak cukup.');

          db.run('UPDATE reseller_users SET saldo = saldo - ? WHERE user_id = ?', [amount, fromId]);
          db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetId]);
          db.run('INSERT INTO reseller_logs (user_id, username, durasi, harga, created_at) VALUES (?, ?, ?, ?, datetime("now", "localtime"))',
            [fromId, `Transfer ke ${targetId}`, 0, amount]);

          ctx.reply(`✅ Berhasil transfer saldo Rp${amount} ke ID ${targetId}.`);
          delete state[fromId];
        });
      });
    }
  });
};