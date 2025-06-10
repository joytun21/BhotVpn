const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { execSync } = require('child_process');

function decryptFile(encryptedPath, outputPath, password) {
  const decipher = crypto.createDecipher('aes-256-cbc', password);
  const input = fs.createReadStream(encryptedPath);
  const output = fs.createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    input.pipe(decipher).pipe(output);
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

async function restoreSQLFromTelegram(fileId, ctx) {
  const encPath = path.join(__dirname, '../restore/tmp_restore.enc');
  const sqlPath = path.join(__dirname, '../restore/tmp_restore.sql');
  const dbPath = path.join(__dirname, '../sellvpn.db');

  try {
    // ⬇️ Download file dari telegram
    const fileLink = await ctx.telegram.getFileLink(fileId);
    const writer = fs.createWriteStream(encPath);
    const response = await axios({
      method: 'get',
      url: fileLink.href,
      responseType: 'stream'
    });
    response.data.pipe(writer);

    await new Promise((res, rej) => {
      writer.on('finish', res);
      writer.on('error', rej);
    });

    // 🔐 Decrypt file terenkripsi
    const password = process.env.BACKUP_KEY || 'backup123';
    await decryptFile(encPath, sqlPath, password);

    // 💣 Replace database lama dengan fresh & clean
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); // hapus dulu
    execSync(`sqlite3 "${dbPath}" < "${sqlPath}"`);

    // 🧹 Bersih-bersih file sementara
    fs.unlinkSync(encPath);
    fs.unlinkSync(sqlPath);

    return true;
  } catch (err) {
    console.error('❌ Restore error:', err.message);
    throw new Error('Restore gagal');
  }
}

module.exports = restoreSQLFromTelegram;