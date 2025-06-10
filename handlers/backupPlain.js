const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function backupPlainSQL() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(__dirname, '../restore', `backup_${timestamp}.sql`);
  const dbPath = path.join(__dirname, '../sellvpn.db');

  return new Promise((resolve, reject) => {
    const command = `sqlite3 "${dbPath}" .dump > "${filePath}"`;
    exec(command, (error) => {
      if (error) return reject(error);
      resolve(filePath);
    });
  });
}

module.exports = {
  backupPlainSQL,
};