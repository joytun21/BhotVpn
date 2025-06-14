const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

async function createssh(username, password, exp, iplimit, serverId) {
  console.log(`⚙️ Creating SSH for ${username} | Exp: ${exp} | IP Limit: ${iplimit}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Server tidak ditemukan.');

      const url = `http://${server.domain}:5888/createssh?user=${username}&password=${password}&exp=${exp}&iplimit=${iplimit}&auth=${server.auth}`;

      try {
        const { data } = await axios.get(url);

        if (data.status !== 'success') return resolve(`❌ Gagal: ${data.message}`);

        const d = data.data;

        const msg = `
🔥 *SSH PREMIUM ACCOUNT*
===========================
👤 *Username:* \`${d.username}\`
🔑 *Password:* \`${d.password}\`
🌐 *Domain:* \`${d.domain}\`
🔧 *NS Domain:* \`${d.ns_domain}\`

🔐 *Ports*
- TLS: 443
- HTTP: 80
- SSH: 22
- SSH WS: 80
- SSL WS: 443
- Dropbear: 109, 443
- DNS: 443, 53, 22
- OVPN: 1194, 2200, 443

🔏 *PUBKEY:*
\`${d.pubkey}\`

🔗 *Save Account:*
\`https://${d.domain}:81/ssh-${d.username}.txt\`
===========================
🔗 *OpenVPN ZIP:*
\`https://${d.domain}:81/allovpn.zip\`
===========================
🕒 *Expired:* \`${d.expired}\`
🌍 *IP Limit:* \`${d.ip_limit}\`
===========================
✨ Terima kasih telah menggunakan layanan kami! ✨
`.trim();

        resolve(msg);
      } catch (e) {
        resolve('❌ Gagal request ke API SSH.');
      }
    });
  });
}

module.exports = { createssh };