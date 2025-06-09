// restore/restoreSecure.js
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const path = require('path');

module.exports = async function restoreSecure(ctx, filePath, logger, options = {}) {
  const ENCRYPT_KEY = options.ENCRYPT_KEY;
  const tempSqlPath = path.join(__dirname, 'decrypted.sql');
  const tempDb = '/root/BotVPN2/restore/temp_secure_restore.db';
  const liveDb = '/root/BotVPN2/sellvpn.db';

  try {
    // 🔓 Decrypt .sql.enc
    const encryptedData = fs.readFileSync(filePath);
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPT_KEY, 'utf8'), Buffer.from(ENCRYPT_KEY.slice(0, 16), 'utf8'));
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    fs.writeFileSync(tempSqlPath, decrypted);

    // 🛡️ Backup DB lama
    const backupName = `/root/BotVPN2/backup/secure_backup_${Date.now()}.db`;
    fs.copyFileSync(liveDb, backupName);

    // ⚙️ Buat temp DB lalu restore SQL
    exec(`sqlite3 ${tempDb} < ${tempSqlPath}`, (err) => {
      if (err) {
        logger.error('❌ RestoreSecure error:', err.message);
        return ctx.reply(`❌ *Restore gagal (decrypt):* ${err.message}`, { parse_mode: 'Markdown' });
      }

      // 🚀 Replace DB utama
      fs.renameSync(tempDb, liveDb);
      ctx.reply('✅ *Restore SQL aman berhasil!* Database telah diperbarui.', { parse_mode: 'Markdown' });
      logger.info(`✅ Admin ${ctx.from.id} berhasil restoreSecure.`);
    });
  } catch (e) {
    logger.error('❌ Secure Restore error:', e.message);
    ctx.reply(`❌ *Restore aman gagal:* ${e.message}`, { parse_mode: 'Markdown' });
  }
};