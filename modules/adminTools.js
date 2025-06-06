// modules/adminTools.js const db = require('../database'); const { adminIds } = require('../core');

function attachAdminTools(bot) { bot.command('addsaldo', async (ctx) => { const senderId = ctx.from.id; if (!adminIds.includes(senderId)) { return ctx.reply('⚠️ Anda tidak memiliki izin.', { parse_mode: 'Markdown' }); }

const args = ctx.message.text.split(' ');
if (args.length !== 3) {
  return ctx.reply('⚠️ Format: /addsaldo <user_id> <jumlah>', { parse_mode: 'Markdown' });
}

const targetUserId = parseInt(args[1]);
const amount = parseInt(args[2]);

if (isNaN(targetUserId) || isNaN(amount) || amount <= 0) {
  return ctx.reply('⚠️ user_id dan jumlah harus angka positif.', { parse_mode: 'Markdown' });
}

db.get('SELECT * FROM users WHERE user_id = ?', [targetUserId], (err, row) => {
  if (err || !row) return ctx.reply('⚠️ user_id tidak ditemukan.');

  db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], function (err) {
    if (err) return ctx.reply('❌ Gagal tambah saldo.');

    ctx.reply(`✅ Saldo sebesar Rp${amount} berhasil ditambahkan ke user ${targetUserId}.`, { parse_mode: 'Markdown' });
  });
});

});

bot.command('ceksaldo', async (ctx) => { const senderId = ctx.from.id; if (!adminIds.includes(senderId)) { return ctx.reply('⚠️ Anda tidak memiliki izin.'); }

const args = ctx.message.text.split(' ');
if (args.length !== 2) {
  return ctx.reply('Format: /ceksaldo <user_id>');
}

const targetUserId = parseInt(args[1]);
if (isNaN(targetUserId)) {
  return ctx.reply('⚠️ user_id harus angka.');
}

db.get('SELECT saldo FROM users WHERE user_id = ?', [targetUserId], (err, row) => {
  if (err || !row) return ctx.reply('⚠️ user_id tidak ditemukan.');

  ctx.reply(`💰 Saldo user ${targetUserId}: Rp${row.saldo}`);
});

});

bot.command('promotereseller', (ctx) => { const senderId = ctx.from.id; if (!adminIds.includes(senderId)) { return ctx.reply('⚠️ Anda tidak memiliki izin.'); }

const args = ctx.message.text.split(' ');
if (args.length !== 2) {
  return ctx.reply('Format: /promotereseller <user_id>');
}

const targetUserId = parseInt(args[1]);
if (isNaN(targetUserId)) {
  return ctx.reply('⚠️ user_id harus angka.');
}

db.run('UPDATE users SET role = "reseller", reseller_level = "silver" WHERE user_id = ?', [targetUserId], function (err) {
  if (err) return ctx.reply('❌ Gagal promote.');

  ctx.reply(`✅ user ${targetUserId} sekarang menjadi reseller.`);
});

}); }

module.exports = { attachAdminTools };

