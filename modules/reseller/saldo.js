// modules/reseller/saldo.js
module.exports = (bot, db, adminIds) => {
  const state = {};
  const isAdmin = (id) => adminIds.includes(id);

  bot.action('tambah_saldo_reseller', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Akses ditolak.');
    state[ctx.from.id] = { step: 'await_id' };
    ctx.reply('🆔 Kirim *ID reseller* yang ingin ditambah saldonya:', { parse_mode: 'Markdown' });
  });

  bot.on('text', async (ctx) => {
    const s = state[ctx.from.id];
    if (!s) return;

    if (s.step === 'await_id') {
      s.targetId = ctx.message.text.trim();
      s.step = 'await_amount';
      return ctx.reply('💰 Masukkan jumlah saldo yang ingin ditambahkan:');
    }

    if (s.step === 'await_amount') {
      const amount = parseInt(ctx.message.text.trim());
      if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Nominal tidak valid.');

      db.run('UPDATE reseller_users SET saldo = saldo + ? WHERE user_id = ?', [amount, s.targetId], (err) => {
        if (err) return ctx.reply('❌ Gagal update saldo.');
        ctx.reply(`✅ Saldo berhasil ditambahkan ke reseller ${s.targetId}`);
        delete state[ctx.from.id];
      });
    }
  });

  bot.action('reset_saldo_reseller', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('❌ Akses ditolak.');
    db.run('UPDATE reseller_users SET saldo = 0', (err) => {
      if (err) return ctx.reply('❌ Gagal reset saldo.');
      ctx.reply('✅ Saldo semua reseller berhasil direset ke Rp0');
    });
  });
};