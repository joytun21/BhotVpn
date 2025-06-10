const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

function decryptFile(encPath, outPath, password) {
  const decipher = crypto.createDecipher('aes-256-cbc', password);
  const input = fs.createReadStream(encPath);
  const output = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    input.pipe(decipher).pipe(output);
    output.on('finish', resolve);
    output.on('error', reject);
  });
}

async function restoreSQLMerge(fileId, ctx) {
  const encPath = path.join(__dirname, '../restore/merge_tmp.enc');
  const sqlPath = path.join(__dirname, '../restore/merge_tmp.sql');
  const tmpDB = path.join(__dirname, '../restore/merge_tmp.db');
  const mainDB = path.join(__dirname, '../sellvpn.db');

  // 1️⃣ Download & decrypt
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const writer = fs.createWriteStream(encPath);
  const response = await axios({ method: 'get', url: fileLink.href, responseType: 'stream' });
  response.data.pipe(writer);

  await new Promise((res, rej) => {
    writer.on('finish', res);
    writer.on('error', rej);
  });

  const password = process.env.BACKUP_KEY || 'backup123';
  await decryptFile(encPath, sqlPath, password);

  // 2️⃣ Import .sql ke tmp database
  execSync(`sqlite3 "${tmpDB}" < "${sqlPath}"`);

  // 3️⃣ Connect ke dua database
  const main = new sqlite3.Database(mainDB);
  const attachSQL = `ATTACH DATABASE '${tmpDB}' AS backup;`;

  await new Promise((resolve, reject) => {
    main.serialize(() => {
      main.run(attachSQL);

      const tables = [
        'users',
        'Server',
        'akun_aktif',
        'reseller_sales',
        'trial_logs',
        'transactions',
        'saldo_transfers',
        'pending_deposits'
      ];

      for (const table of tables) {
        main.run(`INSERT OR IGNORE INTO ${table} SELECT * FROM backup.${table}`);
      }

      main.run('DETACH DATABASE backup', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  // 🧹 Cleanup
  fs.unlinkSync(encPath);
  fs.unlinkSync(sqlPath);
  fs.unlinkSync(tmpDB);

  return true;
}

module.exports = restoreSQLMerge;