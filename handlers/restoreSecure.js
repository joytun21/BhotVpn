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
    // === 1. Read encrypted file (binary)
    const encryptedData = fs.readFileSync(filePath);

    // === 2. Split IV (first 16 bytes) and content
    const iv = encryptedData.slice(0, 16);
    const content = encryptedData.slice(16);

    // === 3. Decrypt using AES-256-CBC
    const key = crypto.createHash('sha256').update(ENCRYPT_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);

    fs.writeFileSync(tempSqlPath, decrypted);

    // 🛡️ Backup DB lama
    const backupName = `/root/BotVPN2/backup/secure_backup_${Date.now()}.db`;
    fs.copyFileSync(liveDb, backupName);

    // ⚙️ Restore ke DB sementara
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