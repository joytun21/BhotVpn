// modules/reseller/logic/saldo.js
module.exports = (bot, db, adminIds) => {
  const saldoState = {};

  const isAdmin = (id) => adminIds.includes(id);

  bot.action('tambah_saldo_reseller', async (ctx) => {
    const userId = ctx.from.id;
    if (!isAdmin(userId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa menambah saldo.');
    }

    saldoState[userId] = { step: 'awaiting_target_id' };
    ctx.reply('🆔 Masukkan *User ID* reseller yang ingin ditambahkan saldo:', {
      parse_mode: 'Markdown'
    });
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = saldoState[userId];
    if (!state) return;

    const input = ctx.message.text.trim();

    if (state.step === 'awaiting_target_id') {
      const targetId = parseInt(input);
      if (isNaN(targetId)) {
        return ctx.reply('⚠️ User ID tidak valid.');
      }

      saldoState[userId] = { step: 'awaiting_amount', targetId };
      return ctx.reply('💰 Masukkan jumlah saldo yang ingin ditambahkan (contoh: 10000):');
    }

    if (state.step === 'awaiting_amount') {
      const amount = parseInt(input);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('⚠️ Jumlah saldo tidak valid.');
      }

      db.run(`
        INSERT INTO reseller_users (user_id, saldo) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET saldo = saldo + excluded.saldo
      `, [state.targetId, amount], (err) => {
        if (err) {
          console.error('❌ Gagal tambah saldo reseller:', err.message);
          return ctx.reply('❌ Gagal tambah saldo.');
        }

        ctx.reply(`✅ Berhasil menambahkan saldo Rp${amount} ke reseller ID \`${state.targetId}\``, {
          parse_mode: 'Markdown'
        });

        delete saldoState[userId];
      });
    }
  });
};