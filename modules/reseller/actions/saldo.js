// modules/reseller/actions/saldo.js
module.exports = (bot, db, adminIds) => {
  const saldoState = {};

  bot.action('tambah_saldo_reseller', async (ctx) => {
    const adminId = ctx.from.id;
    if (!adminIds.includes(adminId)) {
      return ctx.reply('❌ Akses ditolak. Hanya admin yang bisa menambah saldo.');
    }

    saldoState[adminId] = { step: 'await_reseller_id' };
    ctx.reply('📥 Masukkan *User ID* reseller yang ingin ditambah saldonya:', {
      parse_mode: 'Markdown'
    });
  });

  bot.on('text', async (ctx) => {
    const adminId = ctx.from.id;
    const state = saldoState[adminId];
    if (!state) return;

    const input = ctx.message.text.trim();

    if (state.step === 'await_reseller_id') {
      if (!/^\d+$/.test(input)) {
        return ctx.reply('❌ ID tidak valid. Masukkan angka saja.');
      }

      state.resellerId = input;
      state.step = 'await_amount';
      return ctx.reply('💰 Masukkan *jumlah saldo* yang ingin ditambahkan:', { parse_mode: 'Markdown' });
    }

    if (state.step === 'await_amount') {
      const amount = parseInt(input);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Jumlah tidak valid. Masukkan angka lebih dari 0.');
      }

      db.run(`
        INSERT INTO reseller_users (user_id, saldo)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET saldo = saldo + excluded.saldo
      `, [state.resellerId, amount], (err) => {
        if (err) {
          console.error('❌ Error tambah saldo reseller:', err.message);
          return ctx.reply('❌ Gagal menambahkan saldo reseller.');
        }

        ctx.reply(`✅ Saldo sebesar *Rp${amount}* berhasil ditambahkan ke reseller \`${state.resellerId}\``, {
          parse_mode: 'Markdown'
        });
        delete saldoState[adminId];
      });
    }
  });
};