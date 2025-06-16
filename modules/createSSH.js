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
        🔥 *AKUN SSH PREMIUM* 

🔹 *Informasi Akun*

👤 Username   : \`${d.username}\`
🔑 Password   : \`${d.password}\`
🌐 Domain     : \`${d.domain}\`
🛰️ NS Domain  : \`${d.ns_domain}\`
\_\_\_
🔒 TLS        : 443
🌍 HTTP       : 80
🛡️ SSH        : 22
🌐 SSH WS     : 80
🔐 SSL WS     : 443
🧱 Dropbear   : 109, 443
🧭 DNS        : 53, 443, 22
📥 OVPN       : 1194, 2200, 443
\_\_\_

━━━━━━━━━━━━━━━━━━━━━━━
🔏 *PUBKEY:*
\`${d.pubkey}\`
━━━━━━━━━━━━━━━━━━━━━━━
📁 *Link Simpan Akun:*
\`https://${d.domain}:81/ssh-${d.username}.txt\`
━━━━━━━━━━━━━━━━━━━━━━━
📦 *Download OVPN:*
\`https://${d.domain}:81/allovpn.zip\`
━━━━━━━━━━━━━━━━━━━━━━━
📅 *Expired:* \`${d.expired}\`
🌐 *IP Limit:* \`${d.ip_limit} IP\`
━━━━━━━━━━━━━━━━━━━━━━━
✨ Terima kasih telah menggunakan layanan *EXTRIMER TUNNEL*! ✨
`.trim();

        resolve(msg);
      } catch (e) {
        resolve('❌ Gagal request ke API SSH.');
      }
    });
  });
}

module.exports = { createssh };