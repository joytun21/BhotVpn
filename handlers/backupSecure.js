const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

function encryptFile(inputPath, outputPath, password) {
  const cipher = crypto.createCipher('aes-256-cbc', password);
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    input.pipe(cipher).pipe(output);
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

async function backupSQL() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawPath = path.join(__dirname, '../restore', `raw_${timestamp}.sql`);
  const encryptedPath = path.join(__dirname, '../restore', `backup_${timestamp}.enc`);
  const dbPath = path.join(__dirname, '../sellvpn.db');

  return new Promise((resolve, reject) => {
    const cmd = `sqlite3 "${dbPath}" .dump > "${rawPath}"`;
    exec(cmd, async (err) => {
      if (err) return reject(err);

      try {
        const password = process.env.BACKUP_KEY || 'backup123';
        await encryptFile(rawPath, encryptedPath, password);
        fs.unlinkSync(rawPath);
        resolve(encryptedPath);
      } catch (error) {
        reject(error);
      }
    });
  });
}

module.exports = {
  backupSQL,
};