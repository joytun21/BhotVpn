const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execSync } = require('child_process');

async function restorePlainSQL(fileId, ctx) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const filePath = path.join(__dirname, '../restore', 'upload_manual.sql');

  const writer = fs.createWriteStream(filePath);
  const response = await axios({ method: 'get', url: fileLink.href, responseType: 'stream' });
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  execSync(`sqlite3 ./sellvpn.db < "${filePath}"`);
  fs.unlinkSync(filePath);
  return true;
}

module.exports = restorePlainSQL;