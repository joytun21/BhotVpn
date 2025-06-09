// scripts/encrypt_backup.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

// === Konfigurasi ===
const vars = require('../.vars.json');
const ENCRYPT_KEY = vars.ENCRYPT_KEY || 'DefaultPasswordMustBeReplaced';
const ADMIN_ID = vars.USER_ID;
const BOT_TOKEN = vars.BOT_TOKEN;

const sqlPath = path.join(__dirname, '../restore/backup.sql');
const encPath = path.join(__dirname, '../restore/backup.sql.enc');

// === Encrypt dengan IV prepended (untuk decrypt restoreSecure.js)
function encryptFile(input, output, password) {
  const data = fs.readFileSync(input);
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(password).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final()]);
  fs.writeFileSync(output, encrypted);
}

// === Main Logic ===
(async () => {
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ File backup.sql tidak ditemukan!');
    return;
  }

  try {
    encryptFile(sqlPath, encPath, ENCRYPT_KEY);

    const form = new FormData();
    form.append('chat_id', ADMIN_ID);
    form.append('document', fs.createReadStream(encPath), 'backup.sql.enc');

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, form, {
      headers: form.getHeaders(),
    });

    console.log('✅ Encrypted SQL backup sent to Telegram!');
  } catch (err) {
    console.error('❌ Encrypt backup failed:', err.message);
  }
})();