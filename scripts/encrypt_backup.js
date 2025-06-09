const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// === Konfigurasi ===
const vars = require('../.vars.json');
const ENCRYPT_KEY = vars.ENCRYPT_KEY || 'DefaultPasswordMustBeReplaced';
const ADMIN_ID = vars.USER_ID;
const BOT_TOKEN = vars.BOT_TOKEN;

const sqlPath = path.join(__dirname, '../restore/backup.sql');
const encPath = path.join(__dirname, '../restore/backup.sql.enc');

// === AES256 Encrypt ===
function encryptFile(input, output, password) {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(password).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  const inputData = fs.readFileSync(input);
  const encrypted = Buffer.concat([iv, cipher.update(inputData), cipher.final()]);
  fs.writeFileSync(output, encrypted);
}

// === Main ===
(async () => {
  if (!fs.existsSync(sqlPath)) return;

  try {
    encryptFile(sqlPath, encPath, ENCRYPT_KEY);

    const form = new FormData();
    form.append('chat_id', ADMIN_ID);
    form.append('document', fs.createReadStream(encPath), 'backup.sql.enc');

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
      headers: form.getHeaders(),
    });

    console.log('[+] Encrypted SQL backup sent!');
  } catch (err) {
    console.error('[-] Encrypt backup failed:', err.message);
  }
})();