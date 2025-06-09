// utils/crypto.js
const crypto = require('crypto');
const fs = require('fs');

function decryptFile(encryptedPath, decryptedPath, key) {
  return new Promise((resolve, reject) => {
    try {
      const input = fs.readFileSync(encryptedPath);
      const iv = input.slice(0, 16); // ambil IV dari awal
      const encrypted = input.slice(16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);

      let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      fs.writeFileSync(decryptedPath, decrypted);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function encryptFile(sourcePath, encryptedPath, key) {
  return new Promise((resolve, reject) => {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);

      const input = fs.readFileSync(sourcePath);
      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);

      fs.writeFileSync(encryptedPath, Buffer.concat([iv, encrypted]));
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  decryptFile,
  encryptFile,
};