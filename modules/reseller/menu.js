// modules/reseller/actions/menu.js
const isReseller = require('../utils/isReseller');

module.exports = (bot, db) => {
  bot.action('service_reseller', async (ctx) => {
    const userId = ctx.from.id;

    isReseller(db, userId, (isRes) => {
      if (!isRes) {
        return ctx.reply('❌ Akses ditolak. Kamu bukan reseller.');
      }

      const keyboard = [
        [
          { text: '➕ Tambah Reseller', callback_data: 'add_reseller' },
          { text: '❌ Hapus Reseller', callback_data: 'delete_reseller' }
        ],
        [
          { text: '📋 List Reseller', callback_data: 'list_reseller' },
          { text: '💰 Tambah Saldo Reseller', callback_data: 'tambah_saldo_reseller' }
        ],
        [
          { text: '🔄 Reset Saldo', callback_data: 'reset_saldo_reseller' }
        ],
        [
          { text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }
        ]
      ];

      ctx.reply('📂 *Panel Reseller:* Pilih opsi di bawah:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    });
  });
};