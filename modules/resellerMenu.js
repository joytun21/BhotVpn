const db = require('./database');

function attachResellerMenu(bot) {
  // 🔹 KOMISI
  bot.command('komisi', (ctx) => {
    const userId = ctx.from.id;

    db.get('SELECT role, reseller_level FROM users WHERE user_id = ?', [userId], (err, user) => {
      if (err || !user || user.role !== 'reseller') {
        return ctx.reply('❌ Kamu bukan reseller.');
      }

      db.get('SELECT COUNT(*) AS total_akun, SUM(komisi) AS total_komisi FROM reseller_sales WHERE reseller_id = ?', [userId], (err, summary) => {
        if (err) return ctx.reply('❌ Gagal ambil data komisi.');

        db.all('SELECT akun_type, username, komisi, created_at FROM reseller_sales WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 5', [userId], (err, rows) => {
          if (err) return ctx.reply('❌ Gagal ambil riwayat komisi.');

          const list = rows.map((r, i) => `🔹 ${r.akun_type.toUpperCase()} - ${r.username} (+${r.komisi}) 🕒 ${r.created_at}`).join('\n');
          const level = user.reseller_level ? user.reseller_level.toUpperCase() : 'SILVER';
          const text = `💰 *Statistik Komisi Reseller*\n\n` +
            `🎖️ Level: ${level}\n` +
            `🧑‍💻 Total Akun Terjual: ${summary.total_akun}\n` +
            `💸 Total Komisi: Rp${summary.total_komisi || 0}\n\n` +
            `📜 *Transaksi Terbaru:*\n${list}`;

          ctx.reply(text, { parse_mode: 'Markdown' });
        });
      });
    });
  });

  // 🔹 RIWAYAT
  bot.command('riwayatreseller', (ctx) => {
    const userId = ctx.from.id;

    db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, user) => {
      if (err || !user || user.role !== 'reseller') {
        return ctx.reply('❌ Kamu bukan reseller.');
      }

      db.all('SELECT akun_type, username, komisi, created_at FROM reseller_sales WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 10', [userId], (err, rows) => {
        if (err || rows.length === 0) {
          return ctx.reply('ℹ️ Belum ada transaksi reseller.');
        }

        const list = rows.map((r, i) => `#${i + 1}. ${r.akun_type.toUpperCase()} - ${r.username} 💸 Rp${r.komisi} 🕒 ${r.created_at}`).join('\n');
        const msg = `📜 *Riwayat Penjualan Terbaru (10)*\n\n${list}`;
        ctx.reply(msg, { parse_mode: 'Markdown' });
      });
    });
  });

  // 🔹 TOP 10
  bot.command('topreseller', async (ctx) => {
    db.all(`
      SELECT u.user_id, u.reseller_level, SUM(r.komisi) AS total_komisi
      FROM reseller_sales r
      LEFT JOIN users u ON r.reseller_id = u.user_id
      GROUP BY r.reseller_id
      ORDER BY total_komisi DESC
      LIMIT 10
    `, async (err, rows) => {
      if (err || !rows.length) return ctx.reply('❌ Gagal ambil top reseller.');

      const list = await Promise.all(rows.map(async (row, i) => {
        let name = `ID ${row.user_id}`;
        try {
          const user = await ctx.telegram.getChat(row.user_id);
          name = user.username ? `@${user.username}` : user.first_name;
        } catch {}
        const medal = ['🥇', '🥈', '🥉'][i] || '⭐';
        return `${medal} ${name} — Rp${row.total_komisi} (${row.reseller_level?.toUpperCase() || 'SILVER'})`;
      }));

      ctx.reply(`🏆 *Top 10 Reseller Terbaik*\n\n${list.join('\n')}`, {
        parse_mode: 'Markdown'
      });
    });
  });
}

module.exports = { attachResellerMenu };