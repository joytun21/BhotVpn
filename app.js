const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const axios = require('axios');
const QRISPayment = require('qris-payment');
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bot-combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { 
  createssh, 
  createvmess, 
  createvless, 
  createtrojan, 
  createshadowsocks 
} = require('./modules/create');

const { 
  renewssh, 
  renewvmess, 
  renewvless, 
  renewtrojan, 
  renewshadowsocks 
} = require('./modules/renew');

const fs = require('fs');
const { exec } = require('child_process');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 50123;
const ADMIN = vars.USER_ID; 
const NAMA_STORE = vars.NAMA_STORE || 'GabutStore';
const DATA_QRIS = vars.DATA_QRIS;
const MERCHANT_ID = vars.MERCHANT_ID;
const API_KEY = vars.API_KEY;

const bot = new Telegraf(BOT_TOKEN);

const rawAdmin = vars.USER_ID;
const adminIds = Array.isArray(rawAdmin) ? 
rawAdmin.map(String) : [String(rawAdmin)];
logger.info('Bot initialized');

const db = new sqlite3.Database('./sellvpn.db', (err) => {
  if (err) {
    logger.error('Kesalahan koneksi SQLite3:', err.message);
  } else {
    logger.info('Terhubung ke SQLite3');
  }
});

// === INIT DATABASE TABLES ===
db.serialize(() => {
  // Tabel Users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    saldo INTEGER DEFAULT 0,
    role TEXT DEFAULT 'user',
    reseller_level TEXT DEFAULT 'silver',
    has_trial INTEGER DEFAULT 0
  )`, (err) => {
    if (err) {
      logger.error('❌ Gagal membuat tabel users:', err.message);
    }
  });

  // Tabel Reseller Sales
  db.run(`CREATE TABLE IF NOT EXISTS reseller_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reseller_id INTEGER,
    buyer_id INTEGER,
    akun_type TEXT,
    username TEXT,
    komisi INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabel Pending Deposit
  db.run(`CREATE TABLE IF NOT EXISTS pending_deposits (
    unique_code TEXT PRIMARY KEY,
    user_id INTEGER,
    amount INTEGER,
    original_amount INTEGER,
    timestamp INTEGER,
    status TEXT,
    qr_message_id INTEGER
  )`);

  // Tambahkan kolom has_trial (sekali run)
db.run(`ALTER TABLE users ADD COLUMN has_trial INTEGER DEFAULT 0`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    logger.error('❌ Gagal menambahkan kolom has_trial:', err.message);
  }
});

// Tabel trial_logs untuk log pengguna trial
db.run(`CREATE TABLE IF NOT EXISTS trial_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  jenis TEXT,
  created_at TEXT
)`, (err) => {
  if (err) {
    logger.error('❌ Gagal membuat tabel trial_logs:', err.message);
  }
});

  // Tabel Server
  db.run(`CREATE TABLE IF NOT EXISTS Server (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT,
    auth TEXT,
    harga INTEGER,
    nama_server TEXT,
    quota INTEGER,
    iplimit INTEGER,
    batas_create_akun INTEGER,
    total_create_akun INTEGER
  )`);

  // Tabel Transaksi
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    username TEXT,
    created_at TEXT
  )`);

  // Tambahan kolom role (jika belum ada)
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      logger.error('❌ Gagal menambahkan kolom role:', err.message);
    }
  });

  // Tambahan kolom reseller_level (jika belum ada)
  db.run(`ALTER TABLE users ADD COLUMN reseller_level TEXT DEFAULT 'silver'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      logger.error('❌ Gagal menambahkan kolom reseller_level:', err.message);
    }
  });
});

///Tambahan saldo
db.run(`CREATE TABLE IF NOT EXISTS saldo_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER,
  to_id INTEGER,
  amount INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

const userState = {};
logger.info('User state initialized');

function escapeMarkdownV2(text) {
  return text.replace(/[_*[()~`>#+=|{}.!-]/g, '\\$&');
}

// 💡 Fungsi validasi user harus reseller
async function onlyReseller(ctx) {
  const userId = ctx.from.id;
  return new Promise((resolve) => {
    db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err || !row || row.role !== 'reseller') {
        ctx.reply('⛔ *Panel ini hanya tersedia untuk reseller.*', { parse_mode: 'Markdown' });
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}


// ===================== COMMAND HANDLERS =====================
bot.command(['start', 'menu'], async (ctx) => {
  const userId = ctx.from.id;
  logger.info('Start or Menu command received');

  try {
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!user) {
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO users (user_id) VALUES (?)', [userId], (err) => {
          if (err) return reject(err);
          logger.info(`User ID ${userId} berhasil disimpan`);
          resolve();
        });
      });
    } else {
      logger.info(`User ID ${userId} sudah ada di database`);
    }

    await sendMainMenu(ctx);
  } catch (err) {
    logger.error('❌ Gagal inisialisasi user:', err.message);
    return ctx.reply('❌ Terjadi kesalahan saat memuat menu.');
  }
});


bot.command('admin', async (ctx) => {
  logger.info('Admin menu requested');
  
  if (!adminIds.includes(String(ctx.from.id))) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});

//reseller

function renderResellerPanel(ctx, mode = 'full') {
  const isFull = mode === 'full';
  const buttons = [];

  buttons.push([
    { text: '📊 Statistik Penjualan', callback_data: 'stats' },
    { text: '💵 Lihat Komisi', callback_data: 'lihat_komisi' }
  ]);

  buttons.push([
    { text: '🗃️ Export Komisi', callback_data: 'export_komisi' },
    { text: '🏆 Top Reseller', callback_data: 'top_reseller' }
  ]);

  if (isFull) {
    buttons.push([
      { text: '📈 Riwayat Penjualan', callback_data: 'riwayat_penjualan' },
      { text: '💸 Transfer Saldo', callback_data: 'transfer_saldo' }
    ]);

    buttons.push([{ text: '📄 Log Transfer', callback_data: 'log_transfer' }]);
    buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'main_menu' }]);
  }

  const caption = `👤 *Reseller Panel*\n\n` +
                  `🪙 Saldo: Rp${ctx.session?.saldo || 0}\n` +
                  `📊 Level: ${ctx.session?.reseller_level || 'silver'}\n` +
                  `🔖 Role: ${ctx.session?.role || 'reseller'}`;

  return ctx.reply(caption, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}


async function sendMainMenu(ctx) {
  const os = require('os');
  const userId = ctx.from.id;

  const escape = (text = '') => String(text).replace(/[_*()~`>#+\-=|{}.!]/g, '\\$&');

  const uptime = os.uptime();
  const date = new Date();
  const uptimeFormatted = [
    Math.floor((uptime % 86400) / 3600) + 'j',
    Math.floor((uptime % 3600) / 60) + 'm'
  ].join(' ');
  const tanggal = date.toLocaleString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });

  let keyboard = [
    [
      { text: '🛠️ Create Akun', callback_data: 'service_create' },
      { text: '♻️ Renew Akun', callback_data: 'service_renew' }
    ],
    [
      { text: '🎁 Trial Akun', callback_data: 'service_trial' },
      { text: '💳 TopUp Saldo', callback_data: 'topup_saldo' }
    ],
    [
      { text: '🤖 Panel Reseller', callback_data: 'reseller_panel' }
    ]
  ];

  let jumlahServer = 0, jumlahPengguna = 0, saldo = 0, role = '';

  try {
    const result = await new Promise((resolve, reject) => {
      db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) return reject(err);
        resolve(row || {});
      });
    });

    saldo = result.saldo || 0;
    role = result.role || '';

    if (role === 'reseller') {
      keyboard.unshift([{ text: '👑 Menu Reseller', callback_data: 'menu_reseller' }]);
    }

    jumlahServer = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM Server', (err, row) => {
        if (err) reject(err);
        else resolve(row.count || 0);
      });
    });

    jumlahPengguna = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row.count || 0);
      });
    });
  } catch (err) {
    logger.error('❌ Gagal ambil data dasar:', err.message);
  }

  // Top 3 Pengguna
  let topUsersText = '';
  try {
    const topUsers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.user_id, COUNT(t.id) as transaction_count 
        FROM users u 
        LEFT JOIN transactions t ON u.user_id = t.user_id 
        WHERE t.type IN ('ssh','vmess','vless','trojan','shadowsocks')
        GROUP BY u.user_id ORDER BY transaction_count DESC LIMIT 3
      `, [], async (err, rows) => {
        if (err) return reject(err);
        const withNames = await Promise.all(rows.map(async (row, i) => {
          try {
            const user = await bot.telegram.getChat(row.user_id);
            return {
              ...row,
              username: user.username || user.first_name || `User${i}`
            };
          } catch {
            return { ...row, username: `UnknownUser${i}` };
          }
        }));
        resolve(withNames);
      });
    });

    if (topUsers.length > 0) {
      topUsersText = '\n🏆  *_Top 3 Pengguna Aktif_ :*\n' + topUsers.map((user, index) => {
        const medal = ['🥇', '🥈', '🥉'][index] || '⭐';
        return `${medal} - ${escape(user.username)} \${user.transaction_count} transaksi\`;
      }).join('\n');
    }
  } catch (err) {
    logger.error('❌ Gagal ambil top user:', err.message);
  }

  const text = `
╭━━━❖ *VPN AUTO PANEL* ❖━━━╮
┃ 🏪 _*Store*_      : ${escape(NAMA_STORE)}
┃ 🟢 *Status*       : Online ⚡
┃ 🗓️ *Tanggal*      : ${escape(tanggal)}
┃ 💳 _Pembayaran via QRIS_
┃ 
┃ 📊 *Bot Status :*
┃ ┣ ⏱️ *Uptime*     : ${escape(uptimeFormatted)}
┃ ┣ 🌐 *Server*     : ${jumlahServer} aktif
┃ ┣ 👥 *User*       : ${jumlahPengguna} terdaftar
┃ ┣ 💰 *Saldo*      : Rp${saldo}
┃ ┗ 🆔 *Telegram*   : \`${userId}\`
╰━━━━━━━━━━━━━━━━━━━━━━╯
${topUsersText}

📌 *Silakan pilih layanan di bawah ini*
`.trim();

  try {
    const opts = { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: keyboard } };
    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(text, opts);
    } else {
      await ctx.reply(text, opts);
    }
    logger.info('✅ Main menu sent');
  } catch (err) {
    logger.error('❌ Gagal kirim menu:', err.message);
  }
}

bot.command('komisi', (ctx) => {
  const userId = ctx.from.id;

  db.get('SELECT role, reseller_level FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err || !user || user.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    db.get('SELECT COUNT(*) AS total_akun, SUM(komisi) AS total_komisi FROM reseller_sales WHERE reseller_id = ?', [userId], (err, summary) => {
      if (err) {
        logger.error('❌ Gagal ambil data komisi:', err.message);
        return ctx.reply('❌ Gagal ambil data komisi.');
      }

      db.all('SELECT akun_type, username, komisi, created_at FROM reseller_sales WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 5', [userId], (err, rows) => {
        if (err) {
          return ctx.reply('❌ Gagal ambil riwayat komisi.');
        }

        const level = user.reseller_level ? user.reseller_level.toUpperCase() : 'SILVER';

        const list = rows.map((r, i) =>
          `🔹 ${r.akun_type.toUpperCase()} - ${r.username} (+${r.komisi}) 🕒 ${r.created_at}`
        ).join('\n');

        const text = `💰 *Statistik Komisi Reseller*\n\n` +
          `🎖️ Level: ${level}\n` +
          `🧑‍💻 Total Akun Terjual: ${summary.total_akun}\n` +
          `💸 Total Komisi: Rp${summary.total_komisi || 0}\n\n` +
          `📜 *Transaksi Terbaru:*\n${list}`;

        ctx.reply(text, { parse_mode: 'Markdown' });
      });
    });
  });
});

bot.command('logtransfer', (ctx) => {
  const userId = ctx.from.id;

  db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err || !user || user.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    db.all(
      `SELECT * FROM saldo_transfers WHERE from_id = ? ORDER BY created_at DESC LIMIT 5`,
      [userId],
      (err, rows) => {
        if (err || rows.length === 0) {
          return ctx.reply('📭 Belum ada log transfer.');
        }

        const list = rows.map(r =>
          `🔁 Rp${r.amount} ke \`${r.to_id}\` - 🕒 ${r.created_at}`
        ).join('\n');

        ctx.reply(`📜 *Riwayat Transfer Saldo:*\n\n${list}`, { parse_mode: 'Markdown' });
      }
    );
  });
});

bot.command('exportkomisi', (ctx) => {
  const userId = ctx.from.id;

  db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err || !row || row.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    db.all('SELECT akun_type, username, komisi, created_at FROM reseller_sales WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 20', [userId], (err, rows) => {
      if (err) {
        return ctx.reply('❌ Gagal mengambil data komisi.');
      }

      const now = new Date().toLocaleString('id-ID');
      let content = `===== LAPORAN KOMISI RESELLER =====\n\n`;
      content += `🧑‍💻 Reseller ID : ${userId}\n📅 Tanggal Export: ${now}\n\n`;
      content += `#  | Akun Type | Username   | Komisi | Tanggal\n`;
      content += `--------------------------------------------------\n`;

      rows.forEach((r, i) => {
        content += `${i + 1}  | ${r.akun_type.toUpperCase()}     | ${r.username.padEnd(10)} | ${r.komisi}     | ${r.created_at}\n`;
      });

      const filename = `komisi_${userId}.txt`;
      fs.writeFileSync(filename, content);

      ctx.replyWithDocument({ source: filename, filename }, {
        caption: '📁 Laporan Komisi Terbaru',
      });

      // Opsional: hapus file setelah dikirim
      setTimeout(() => fs.unlinkSync(filename), 5000);
    });
  });
});

bot.command('topreseller', (ctx) => {
  db.all(`
    SELECT users.user_id, users.username, SUM(reseller_sales.komisi) AS total_komisi, COUNT(*) AS total_akun
    FROM reseller_sales
    JOIN users ON reseller_sales.reseller_id = users.user_id
    GROUP BY reseller_sales.reseller_id
    ORDER BY total_komisi DESC
    LIMIT 10
  `, (err, rows) => {
    if (err) {
      logger.error('❌ Gagal ambil data top reseller:', err.message);
      return ctx.reply('❌ Gagal mengambil data top reseller.');
    }

    if (rows.length === 0) {
      return ctx.reply('ℹ️ Belum ada transaksi reseller.');
    }

    let text = `🏆 *Top 10 Reseller by Komisi*\n\n`;

    rows.forEach((r, i) => {
      text += `#${i + 1} 👤 ${r.username || 'Unknown'}\n`;
      text += `   🛒 Akun Terjual: ${r.total_akun}\n`;
      text += `   💰 Total Komisi : Rp${r.total_komisi}\n\n`;
    });

    ctx.reply(text, { parse_mode: 'Markdown' });
  });
});

bot.command('export_log', async (ctx) => {
  const userId = ctx.from.id;
  if (`${userId}` !== `${USER_ID}`) return ctx.reply('❌ Akses ditolak.');

  const filename = `/tmp/transactions-${Date.now()}.csv`;

  db.all('SELECT * FROM transactions ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return ctx.reply('❌ Gagal ambil data.');

    const headers = Object.keys(rows[0] || {}).join(',') + '\n';
    const content = rows.map(r => Object.values(r).join(',')).join('\n');

    require('fs').writeFileSync(filename, headers + content);

    ctx.replyWithDocument({ source: filename });
  });
});


bot.command('promotereseller', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(String(ctx.from.id))) {
  return ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
}

  const args = ctx.message.text.split(' ');
  if (args.length !== 2) {
    return ctx.reply('❗ Format: /promotereseller <user_id>');
  }

  const targetUserId = parseInt(args[1]);
  if (isNaN(targetUserId)) {
    return ctx.reply('❌ user_id harus berupa angka.');
  }

  db.run('UPDATE users SET role = "reseller" WHERE user_id = ?', [targetUserId], function (err) {
    if (err) {
      logger.error('❌ Error update role reseller:', err.message);
      return ctx.reply('❌ Gagal update role reseller.');
    }
    ctx.reply(`✅ User ${targetUserId} kini menjadi RESELLER.`);
  });
});


bot.command('transfer', async (ctx) => {
  const [cmd, targetId, amountStr] = ctx.message.text.split(' ');
  const fromId = ctx.from.id;
  const amount = parseInt(amountStr);

  if (!targetId || isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Format salah.\n\nContoh:\n`/transfer 123456789 5000`', { parse_mode: 'Markdown' });
  }

  db.get('SELECT saldo, role FROM users WHERE user_id = ?', [fromId], (err, fromUser) => {
    if (err || !fromUser || fromUser.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller atau data tidak ditemukan.');
    }

    if (fromUser.saldo < amount) {
      return ctx.reply('❌ Saldo kamu tidak cukup untuk transfer.');
    }

    db.get('SELECT user_id FROM users WHERE user_id = ?', [targetId], (err, targetUser) => {
      if (err || !targetUser) return ctx.reply('❌ User tujuan tidak ditemukan.');

      // Simpan data ke state sementara
      userState[fromId] = { to: targetId, amount };

      ctx.reply(
        `⚠️ Konfirmasi transfer saldo:\n\nTransfer *Rp${amount}* ke user \`${targetId}\`?\n\nTekan tombol di bawah untuk lanjut.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Konfirmasi', callback_data: 'confirm_transfer' },
                { text: '❌ Batal', callback_data: 'cancel_transfer' }
              ]
            ]
          }
        }
      );
    });
  });
});



bot.command('hapuslog', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) return ctx.reply('Tidak ada izin!');
  try {
    if (fs.existsSync('bot-combined.log')) fs.unlinkSync('bot-combined.log');
    if (fs.existsSync('bot-error.log')) fs.unlinkSync('bot-error.log');
    ctx.reply('Log berhasil dihapus.');
    logger.info('Log file dihapus oleh admin.');
  } catch (e) {
    ctx.reply('Gagal menghapus log: ' + e.message);
    logger.error('Gagal menghapus log: ' + e.message);
  }
});

bot.command('helpadmin', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }
  const helpMessage = `
*📋 Daftar Perintah Admin:*

1. /addserver - Menambahkan server baru.
2. /addsaldo - Menambahkan saldo ke akun pengguna.
3. /editharga - Mengedit harga layanan.
4. /editnama - Mengedit nama server.
5. /editdomain - Mengedit domain server.
6. /editauth - Mengedit auth server.
7. /editlimitquota - Mengedit batas quota server.
8. /editlimitip - Mengedit batas IP server.
9. /editlimitcreate - Mengedit batas pembuatan akun server.
10. /edittotalcreate - Mengedit total pembuatan akun server.
11. /broadcast - Mengirim pesan siaran ke semua pengguna.
12. /hapuslog - Menghapus log bot.

Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

bot.command('getid', (ctx) => {
  ctx.reply(`🆔 ID kamu: ${ctx.from.id}`);
});

bot.command('broadcast', async (ctx) => {
  const userId = ctx.message.from.id;
  logger.info(`Broadcast command received from user_id: ${userId}`);
  if (!adminIds.includes(userId)) {
      logger.info(`⚠️ User ${userId} tidak memiliki izin untuk menggunakan perintah ini.`);
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const message = ctx.message.reply_to_message ? ctx.message.reply_to_message.text : ctx.message.text.split(' ').slice(1).join(' ');
  if (!message) {
      logger.info('⚠️ Pesan untuk disiarkan tidak diberikan.');
      return ctx.reply('⚠️ Mohon berikan pesan untuk disiarkan.', { parse_mode: 'Markdown' });
  }

  db.all("SELECT user_id FROM users", [], (err, rows) => {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengambil daftar pengguna:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengambil daftar pengguna.', { parse_mode: 'Markdown' });
      }

      rows.forEach((row) => {
          const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
          axios.post(telegramUrl, {
              chat_id: row.user_id,
              text: message
          }).then(() => {
              logger.info(`✅ Pesan siaran berhasil dikirim ke ${row.user_id}`);
          }).catch((error) => {
              logger.error(`⚠️ Kesalahan saat mengirim pesan siaran ke ${row.user_id}`, error.message);
          });
      });

      ctx.reply('✅ Pesan siaran berhasil dikirim.', { parse_mode: 'Markdown' });
  });
});
bot.command('saldo', (ctx) => {
  const state = userState[ctx.chat.id] || {}; // ⬅️ ini bikin gak error walau kosong
  const userId = ctx.from.id;

  db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('❌ Gagal mengambil saldo:', err.message);
      return ctx.reply('❌ Terjadi kesalahan saat mengambil saldo.');
    }

    if (!row) {
      return ctx.reply('⚠️ Akun tidak ditemukan.');
    }

    return ctx.reply(`💰 *Saldo Anda:* \`${row.saldo}\``, { parse_mode: 'Markdown' });
  });
});

bot.command('riwayatreseller', (ctx) => {
  const userId = ctx.from.id;
  // 1. Cek role
  db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err || !user || user.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    // 2. Ambil 10 transaksi terakhir
    db.all('SELECT akun_type, username, komisi, created_at FROM reseller_sales WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 10', [userId], (err, rows) => {
      if (err || rows.length === 0) {
        return ctx.reply('ℹ️ Belum ada transaksi reseller.');
      }

      // 3. Format teks
      const list = rows.map((r, i) =>
        `${i + 1}. ${r.akun_type.toUpperCase()} - ${r.username} 💸 Rp${r.komisi} 🕒 ${r.created_at}`
      ).join('\n');

      const msg = `📜 *Riwayat Penjualan Terbaru (10)*\n\n${list}`;
      ctx.reply(msg, { parse_mode: 'Markdown' });
    });
  });
});

bot.command('injectdummy', (ctx) => {
  const userId = ctx.from.id;
  if (!adminIds.includes(String(userId))) {
  return ctx.reply('❌ Kamu bukan admin.');
}

  const target = 7953876588; // ID tujuan dummy
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  const stmt = db.prepare(`INSERT INTO saldo_transfers (from_id, to_id, amount, created_at) VALUES (?, ?, ?, ?)`);
  for (let i = 1; i <= 5; i++) {
    stmt.run(userId, target, 5000 * i, now);
  }
  stmt.finalize();

  ctx.reply('✅ Dummy log transfer telah ditambahkan!');
});


bot.command('addserver', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 7) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/addserver <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_account>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args.slice(1);

  const numberOnlyRegex = /^\d+$/;
  if (!numberOnlyRegex.test(harga) || !numberOnlyRegex.test(quota) || !numberOnlyRegex.test(iplimit) || !numberOnlyRegex.test(batas_create_akun)) {
      return ctx.reply('⚠️ `harga`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?)", 
      [domain, auth, parseInt(harga), nama_server, parseInt(quota), parseInt(iplimit), parseInt(batas_create_akun)], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat menambahkan server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  });
});
bot.command('editharga', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editharga <domain> <harga>`', { parse_mode: 'Markdown' });
  }

  const [domain, harga] = args.slice(1);

  if (!/^\d+$/.test(harga)) {
      return ctx.reply('⚠️ `harga` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET harga = ? WHERE domain = ?", [parseInt(harga), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit harga server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Harga server \`${domain}\` berhasil diubah menjadi \`${harga}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editnama', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editnama <domain> <nama_server>`', { parse_mode: 'Markdown' });
  }

  const [domain, nama_server] = args.slice(1);

  db.run("UPDATE Server SET nama_server = ? WHERE domain = ?", [nama_server, domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit nama server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit nama server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Nama server \`${domain}\` berhasil diubah menjadi \`${nama_server}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editdomain', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editdomain <old_domain> <new_domain>`', { parse_mode: 'Markdown' });
  }

  const [old_domain, new_domain] = args.slice(1);

  db.run("UPDATE Server SET domain = ? WHERE domain = ?", [new_domain, old_domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit domain server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit domain server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Domain server \`${old_domain}\` berhasil diubah menjadi \`${new_domain}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editauth', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editauth <domain> <auth>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth] = args.slice(1);

  db.run("UPDATE Server SET auth = ? WHERE domain = ?", [auth, domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit auth server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit auth server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Auth server \`${domain}\` berhasil diubah menjadi \`${auth}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitquota', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitquota <domain> <quota>`', { parse_mode: 'Markdown' });
  }

  const [domain, quota] = args.slice(1);

  if (!/^\d+$/.test(quota)) {
      return ctx.reply('⚠️ `quota` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET quota = ? WHERE domain = ?", [parseInt(quota), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit quota server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit quota server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Quota server \`${domain}\` berhasil diubah menjadi \`${quota}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitip', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitip <domain> <iplimit>`', { parse_mode: 'Markdown' });
  }

  const [domain, iplimit] = args.slice(1);

  if (!/^\d+$/.test(iplimit)) {
      return ctx.reply('⚠️ `iplimit` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET iplimit = ? WHERE domain = ?", [parseInt(iplimit), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit iplimit server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit iplimit server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Iplimit server \`${domain}\` berhasil diubah menjadi \`${iplimit}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitcreate <domain> <batas_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, batas_create_akun] = args.slice(1);

  if (!/^\d+$/.test(batas_create_akun)) {
      return ctx.reply('⚠️ `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET batas_create_akun = ? WHERE domain = ?", [parseInt(batas_create_akun), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit batas_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit batas_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Batas create akun server \`${domain}\` berhasil diubah menjadi \`${batas_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});

///reseller
bot.command('transfer', async (ctx) => {
  const [cmd, targetId, amountStr] = ctx.message.text.split(' ');

  const fromId = ctx.from.id;
  const amount = parseInt(amountStr);

  if (!targetId || isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Format salah.\n\nContoh:\n`/transfer 123456789 5000`', { parse_mode: 'Markdown' });
  }

  db.get('SELECT saldo, role FROM users WHERE user_id = ?', [fromId], (err, fromUser) => {
    if (err || !fromUser || fromUser.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller atau data tidak ditemukan.');
    }

    if (fromUser.saldo < amount) {
      return ctx.reply('❌ Saldo kamu tidak cukup untuk transfer.');
    }

    db.get('SELECT user_id FROM users WHERE user_id = ?', [targetId], (err, targetUser) => {
      if (err) return ctx.reply('❌ Gagal cek user tujuan.');

      if (!targetUser) {
        return ctx.reply('❌ User tujuan tidak ditemukan.');
      }

      db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [amount, fromId], (err) => {
        if (err) return ctx.reply('❌ Gagal potong saldo pengirim.');

        db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetId], (err) => {
          if (err) return ctx.reply('❌ Gagal tambahkan saldo ke penerima.');

          ctx.reply(`✅ Transfer saldo Rp${amount} ke user \`${targetId}\` berhasil.`, { parse_mode: 'Markdown' });
        });
      });
    });
  });
});

bot.command('edittotalcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/edittotalcreate <domain> <total_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, total_create_akun] = args.slice(1);

  if (!/^\d+$/.test(total_create_akun)) {
      return ctx.reply('⚠️ `total_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET total_create_akun = ? WHERE domain = ?", [parseInt(total_create_akun), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit total_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit total_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Total create akun server \`${domain}\` berhasil diubah menjadi \`${total_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});
async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'create') {
    keyboard = [
      [{ text: '🛠️ SSH & OpenVPN', callback_data: 'create_ssh' }],
      [
        { text: '🚀 VMess', callback_data: 'create_vmess' },
        { text: '⚡ VLESS', callback_data: 'create_vless' }
      ],
      [
        { text: '🌀 Trojan', callback_data: 'create_trojan' },
        { text: '🔒 Shadowsocks', callback_data: 'create_shadowsocks' }
      ],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: '🛫 SSH & OpenVPN', callback_data: 'renew_ssh' }],
      [
        { text: '🛬 VMess', callback_data: 'renew_vmess' },
        { text: '🛩 VLESS', callback_data: 'renew_vless' }
      ],
      [
        { text: '✈️ Trojan', callback_data: 'renew_trojan' },
        { text: '🛸 Shadowsocks', callback_data: 'renew_shadowsocks' }
      ],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'trial') {
    keyboard = [
      [
        { text: '🎁 Trial SSH', callback_data: 'trial_ssh' },
        { text: '🎁 Trial VMess', callback_data: 'trial_vmess' }
      ],
      [
        { text: '🎁 Trial VLESS', callback_data: 'trial_vless' },
        { text: '🎁 Trial Trojan', callback_data: 'trial_trojan' }
      ],
      [
        { text: '🎁 Trial SSocks', callback_data: 'trial_shadowsocks' }
      ],
      [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]
    ];
  }
  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    logger.info(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      logger.info(`${action} service menu sent as new message`);
    } else {
      logger.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}
async function sendAdminMenu(ctx) {
  const adminKeyboard = [
    [
      { text: '➕ Tambah Server', callback_data: 'addserver' },
      { text: '❌ Hapus Server', callback_data: 'deleteserver' }
    ],
    [
      { text: '💲 Edit Harga', callback_data: 'editserver_harga' },
      { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }
    ],
    [
      { text: '🌐 Edit Domain', callback_data: 'editserver_domain' },
      { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }
    ],
    [
      { text: '📊 Edit Quota', callback_data: 'editserver_quota' },
      { text: '?? Edit Limit IP', callback_data: 'editserver_limit_ip' }
    ],
    [
      { text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' },
      { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }
    ],
    [
      { text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' },
      { text: '📋 List Server', callback_data: 'listserver' }
    ],
    [
      { text: '♻️ Reset Server', callback_data: 'resetdb' },
      { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }
    ],
    [
      { text: '🔙 Kembali', callback_data: 'send_main_menu' }
    ]
  ];

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: adminKeyboard
    });
    logger.info('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply('⚙️ MENU ADMIN', {
        reply_markup: {
          inline_keyboard: adminKeyboard
        }
      });
      logger.info('Admin menu sent as new message');
    } else {
      logger.error('Error saat mengirim menu admin:', error);
    }
  }
}



///reseller
bot.action('stats', ctx => {
  ctx.answerCbQuery();
  ctx.reply('📊 Statistik penjualanmu saat ini belum tersedia.');
});

bot.action('lihat_komisi', ctx => {
  ctx.answerCbQuery();
  ctx.reply('💵 Komisi kamu akan ditampilkan di sini...');
});

bot.action('export_komisi', ctx => {
  ctx.answerCbQuery();
  ctx.reply('🗃️ Meng-export data komisi...');
});

bot.action('top_reseller', ctx => {
  ctx.answerCbQuery();
  ctx.reply('🏆 Top reseller minggu ini...');
});

bot.action('riwayat_penjualan', ctx => {
  ctx.answerCbQuery();
  ctx.reply('📈 Riwayat penjualan akan muncul di sini...');
});

bot.action('transfer_saldo', ctx => {
  ctx.answerCbQuery();
  ctx.reply('💸 Kirim saldo ke reseller lain belum diaktifkan.');
});

bot.action('log_transfer', ctx => {
  ctx.answerCbQuery();
  ctx.reply('📄 Log transfer saldo belum tersedia.');
});

bot.action('main_menu', ctx => {
  ctx.answerCbQuery();
  // Panggil fungsi ke menu utama
  return renderMainMenu(ctx); // ← ini harus kamu punya sebelumnya bro
});


bot.action('service_create', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'create');
});

bot.action('service_renew', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'renew');
});

bot.action('service_trial', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'trial');
});

bot.action('reseller_panel', async (ctx) => {
  const userId = ctx.from.id; // 🛠️ FIX INI
  const valid = await onlyReseller(ctx);
  if (!valid) return;
  await ctx.answerCbQuery();

  db.get('SELECT saldo, reseller_level, role FROM users WHERE user_id = ?', [userId], async (err, user) => {
    if (err || !user) {
      return ctx.reply('❌ Gagal ambil data reseller.');
    }

    const text = `╭─────⍟ *Reseller Panel* ⍟─────╮
💰 *Saldo*: Rp${user.saldo.toLocaleString('id-ID')}
📊 *Level*: ${user.reseller_level}
👤 *Role*: ${user.role}
🆔 *ID Telegram*: ${userId}
╰────────────────────────────╯`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📈 Statistik Penjualan', callback_data: 'riwayat_penjualan' }],
          [{ text: '💵 Lihat Komisi', callback_data: 'lihat_komisi' }],
          [{ text: '📤 Export Komisi', callback_data: 'export_komisi' }],
          [{ text: '🏆 Top Reseller', callback_data: 'top_reseller' }]
        ]
      },
      parse_mode: 'Markdown'
    };

    return ctx.reply(text, keyboard);
  });
});

// 📈 Statistik Penjualan
bot.action('riwayat_penjualan', async (ctx) => {
  const valid = await onlyReseller(ctx);
  if (!valid) return;
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  db.all(`
    SELECT akun_type, username, komisi, created_at 
    FROM reseller_sales 
    WHERE reseller_id = ? 
    ORDER BY created_at DESC LIMIT 5
  `, [userId], (err, rows) => {
    if (err || !rows.length) {
      return ctx.reply('📭 Belum ada penjualan.');
    }

    const list = rows.map(row => {
      return `📦 ${row.akun_type.toUpperCase()} - ${row.username}\n💰 Rp${row.komisi} 🕒 ${row.created_at}`;
    }).join('\n\n');

    return ctx.reply(`📈 *Riwayat Penjualan Terakhir:*\n\n${list}`, { parse_mode: 'Markdown' });
  });
});

// 💵 Lihat Komisi
bot.action('lihat_komisi', async (ctx) => {
  const valid = await onlyReseller(ctx);
  if (!valid) return;
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  db.get(`SELECT SUM(komisi) as total FROM reseller_sales WHERE reseller_id = ?`, [userId], (err, row) => {
    if (err) {
      return ctx.reply('❌ Gagal ambil data komisi.');
    }

    const total = row?.total || 0;
    ctx.reply(`💵 *Total Komisi Kamu:* Rp${total.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' });
  });
});

// 📤 Export Komisi
bot.action('export_komisi', async (ctx) => {
  const valid = await onlyReseller(ctx);
  if (!valid) return;
  await ctx.answerCbQuery();

  const userId = ctx.from.id;
  db.all(`
    SELECT akun_type, username, komisi, created_at 
    FROM reseller_sales 
    WHERE reseller_id = ?
  `, [userId], async (err, rows) => {
    if (err || !rows.length) {
      return ctx.reply('❌ Gagal export: tidak ada data.');
    }

    const csvRows = ['No,Tipe,Username,Komisi,Tanggal'];
    rows.forEach((r, i) => {
      csvRows.push(`${i+1},${r.akun_type},${r.username},${r.komisi},${r.created_at}`);
    });

    const fs = require('fs');
    const path = `./export_komisi_${userId}.csv`;
    fs.writeFileSync(path, csvRows.join('\n'));

    await ctx.replyWithDocument({ source: path, filename: `Komisi_${userId}.csv` });
    fs.unlinkSync(path);
  });
});

// 🏆 Top Reseller
bot.action('top_reseller', async (ctx) => {
  const valid = await onlyReseller(ctx);
  if (!valid) return;
  await ctx.answerCbQuery();

  db.all(`
    SELECT reseller_id, SUM(komisi) AS total 
    FROM reseller_sales 
    GROUP BY reseller_id 
    ORDER BY total DESC 
    LIMIT 5
  `, async (err, rows) => {
    if (err || !rows.length) {
      return ctx.reply('⚠️ Tidak ada data reseller saat ini.');
    }

    const formatted = await Promise.all(rows.map(async (r, i) => {
      try {
        const chat = await bot.telegram.getChat(r.reseller_id);
        const name = chat.username ? `@${chat.username}` : chat.first_name;
        return `🏅 ${i + 1}. ${name} - Rp${r.total.toLocaleString('id-ID')}`;
      } catch {
        return `🏅 ${i + 1}. ID ${r.reseller_id} - Rp${r.total.toLocaleString('id-ID')}`;
      }
    }));

    return ctx.reply(`🏆 *Top Reseller Minggu Ini:*\n\n${formatted.join('\n')}`, { parse_mode: 'Markdown' });
  });
});
// ===================== ACTION: MENU RESELLER =====================
bot.action('confirm_transfer', async (ctx) => {
  const fromId = ctx.from.id;
  const data = userState[fromId];
  if (!data) return ctx.reply('❌ Tidak ada data transfer untuk dikonfirmasi.');

  const { to: targetId, amount } = data;

  db.get('SELECT saldo FROM users WHERE user_id = ?', [fromId], (err, user) => {
    if (err || !user || user.saldo < amount) {
      return ctx.reply('❌ Saldo tidak cukup atau data tidak ditemukan.');
    }

    db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [amount, fromId], (err) => {
      if (err) return ctx.reply('❌ Gagal kurangi saldo.');

      db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetId], (err) => {
        if (err) return ctx.reply('❌ Gagal tambah saldo.');

        db.run(`INSERT INTO saldo_transfers (from_id, to_id, amount) VALUES (?, ?, ?)`, [fromId, targetId, amount]);

        ctx.editMessageText(`✅ Berhasil transfer *Rp${amount}* ke \`${targetId}\``, { parse_mode: 'Markdown' });
        delete userState[fromId];
      });
    });
  });
});

bot.action('cancel_transfer', async (ctx) => {
  const userId = ctx.from.id;
  delete userState[userId];
  await ctx.editMessageText('❌ Transfer dibatalkan.');
});

bot.action('menu_reseller', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!row || row.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '💰 Cek Komisi', callback_data: 'reseller_komisi' }],
        [{ text: '📊 Riwayat Penjualan', callback_data: 'reseller_riwayat' }],
        [{ text: '🔁 Transfer Saldo', callback_data: 'reseller_transfer' }],
        [{ text: '🧾 Log Transfer', callback_data: 'reseller_logtransfer' }],
        [{ text: '⬅️ Kembali ke Menu Utama', callback_data: 'back_to_main' }]
      ]
    };

    const content = `👑 *Menu Reseller*\n\n🕒 ${new Date().toLocaleString('id-ID')}`;

    try {
      await ctx.editMessageText(content, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (err) {
      if (err.response?.error_code === 400) {
        await ctx.reply(content, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else {
        logger.error('❌ Gagal tampilkan menu reseller:', err.message);
      }
    }
  } catch (err) {
    logger.error('❌ Error query menu_reseller:', err.message);
    return ctx.reply('⚠️ Terjadi kesalahan saat memuat menu reseller.');
  }
});

bot.action('reseller_komisi', (ctx) => {
  const userId = ctx.from.id;

  db.get('SELECT role, reseller_level FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err || !user || user.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    db.get('SELECT COUNT(*) AS total_akun, SUM(komisi) AS total_komisi FROM reseller_sales WHERE reseller_id = ?', [userId], (err, summary) => {
      if (err) {
        logger.error('❌ Gagal ambil data komisi:', err.message);
        return ctx.reply('❌ Gagal ambil data komisi.');
      }

      db.all('SELECT akun_type, username, komisi, created_at FROM reseller_sales WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 5', [userId], (err, rows) => {
        if (err) {
          return ctx.reply('❌ Gagal ambil riwayat komisi.');
        }

        const level = user.reseller_level ? user.reseller_level.toUpperCase() : 'SILVER';

        const list = rows.map((r, i) =>
          `🔹 ${r.akun_type.toUpperCase()} - ${r.username} (+Rp${r.komisi}) 🕒 ${r.created_at}`
        ).join('\n') || '_Belum ada transaksi_';

        const text = `💰 *Statistik Komisi Reseller*\n\n` +
          `🎖️ Level: ${level}\n` +
          `🧑‍💻 Total Akun Terjual: ${summary.total_akun}\n` +
          `💸 Total Komisi: Rp${summary.total_komisi || 0}\n\n` +
          `📜 *Transaksi Terbaru:*\n${list}`;

        ctx.editMessageText(text, { parse_mode: 'Markdown' });
      });
    });
  });
});

bot.action('reseller_riwayat', (ctx) => {
  const userId = ctx.from.id;

  db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, user) => {
    if (err || !user || user.role !== 'reseller') {
      return ctx.reply('❌ Kamu bukan reseller.');
    }

    db.all(
      `SELECT akun_type, username, komisi, created_at FROM reseller_sales 
       WHERE reseller_id = ? ORDER BY created_at DESC LIMIT 10`,
      [userId],
      (err, rows) => {
        if (err) {
          logger.error('❌ Gagal ambil riwayat penjualan:', err.message);
          return ctx.reply('❌ Gagal ambil data riwayat.');
        }

        if (rows.length === 0) {
          return ctx.editMessageText('📊 Belum ada penjualan akun.', {
            parse_mode: 'Markdown'
          });
        }

        const list = rows.map((r, i) =>
          `🔸 *${r.akun_type.toUpperCase()}* - ${r.username} (+Rp${r.komisi})\n🕒 ${r.created_at}`
        ).join('\n\n');

        const text = `📊 *Riwayat Penjualan Terakhir*\n\n${list}`;

        ctx.editMessageText(text, { parse_mode: 'Markdown' });
      }
    );
  });
});

bot.action('reseller_transfer', (ctx) => {
  ctx.editMessageText('💸 Gunakan format berikut:\n\n`/transfer USER_ID JUMLAH`\n\nContoh:\n`/transfer 123456789 5000`', {
    parse_mode: 'Markdown'
  });
});

bot.action('reseller_logtransfer', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  const header = '🧾 *Riwayat Transfer Saldo Terakhir:*\n\n';

  db.all(
    `SELECT to_id, amount, created_at FROM saldo_transfers 
     WHERE from_id = ? 
     ORDER BY datetime(created_at) DESC 
     LIMIT 5`,
    [userId],
    async (err, rows) => {
      if (err) {
        logger.error('❌ Gagal ambil log transfer:', err.message);
        return ctx.reply('⚠️ Gagal mengambil riwayat transfer.', { parse_mode: 'MarkdownV2' });
      }

      if (!rows || rows.length === 0) {
        return ctx.reply('📭 Belum ada riwayat transfer saldo.', { parse_mode: 'MarkdownV2' });
      }

      const list = await Promise.all(rows.map(async (row) => {
        let recipient = `ID ${row.to_id}`;
        try {
          const user = await bot.telegram.getChat(row.to_id);
          recipient = user.username
            ? `@${user.username}`
            : user.first_name || recipient;
        } catch {}

        const date = new Date(row.created_at).toLocaleString('id-ID');
        return `🔸 Ke ${escapeMarkdownV2(recipient)} \ID ${row.to_id}\ \\+Rp${row.amount} 🕒 ${escapeMarkdownV2(date)}`;
      }));

      const message = escapeMarkdownV2(header) + list.join('\n');
      ctx.reply(message, { parse_mode: 'MarkdownV2' });
    }
  );
});

bot.action('back_to_main', (ctx) => {
  sendMainMenu(ctx);
});
// ===================== ACTION: TRIAL AKUN =====================
bot.action('trial_ssh', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  db.get('SELECT has_trial FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('Gagal cek status trial:', err.message);
      return ctx.reply('❌ Gagal cek status trial.');
    }

    if (!row) {
      db.run('INSERT INTO users (user_id, has_trial) VALUES (?, 0)', [userId], (err) => {
        if (err) {
          logger.error('Gagal daftar user saat trial:', err.message);
          return ctx.reply('❌ Gagal simpan user untuk trial.');
        }
        return ctx.reply('🔁 Silakan tekan tombol trial lagi.');
      });
      return;
    }

    if (row.has_trial === 1) {
      return ctx.reply('😅 Kamu sudah pernah ambil trial bro.');
    }

    exec('bash ./scripts/trialssh.sh', (error, stdout, stderr) => {
      if (error) {
        logger.error('Gagal eksekusi script trial:', error.message);
        return ctx.reply('❌ Gagal jalankan script trial.');
      }

      try {
        const json = JSON.parse(stdout.trim());
        const { username, password, ip, domain, city, ns_domain, public_key, expiration, ports, openvpn_link, save_link, wss_payload } = json;

        db.run('UPDATE users SET has_trial = 1 WHERE user_id = ?', [userId]);
        db.run('INSERT INTO trial_logs (user_id, username, jenis, created_at) VALUES (?, ?, ?, datetime("now"))', [userId, username, 'ssh']);

        const replyText = `
🔰 *AKUN SSH TRIAL*

👤 \`User:\` ${username}
🔑 \`Pass:\` ${password}
🌍 \`IP:\` ${ip}
🏙️ \`Lokasi:\` ${city}
📡 \`Domain:\` ${domain}
🔐 \`PubKey:\` ${public_key}

🔌 *PORT*
\_\_\_
OpenSSH   : ${ports.openssh}
Dropbear  : ${ports.dropbear}
UDP SSH   : ${ports.udp_ssh}
DNS       : ${ports.dns}
WS        : ${ports.ssh_ws}
SSL WS    : ${ports.ssh_ssl_ws}
SSL/TLS   : ${ports.ssl_tls}
OVPN TCP  : ${ports.ovpn_tcp}
OVPN UDP  : ${ports.ovpn_udp}
OVPN SSL  : ${ports.ovpn_ssl}
BadVPN    : ${ports.badvpn}
\_\_\_

🔗 *Link*
OVPN     : ${openvpn_link}
Save     : ${save_link}
Payload  : \`${wss_payload}\`

📆 *Expired:* ${expiration}
        `.trim();

        ctx.reply(replyText, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } catch (e) {
        logger.error('❌ Gagal parsing hasil trial:', e.message);
        ctx.reply('❌ Gagal membaca data trial.');
      }
    });
  });
});

//trial vmess
bot.action('trial_vmess', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  db.get('SELECT has_trial FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('Gagal cek status trial:', err.message);
      return ctx.reply('❌ Gagal cek status trial.');
    }

    if (!row) {
      db.run('INSERT INTO users (user_id, has_trial) VALUES (?, 0)', [userId], (err) => {
        if (err) {
          logger.error('Gagal daftar user saat trial VMess:', err.message);
          return ctx.reply('❌ Gagal simpan user untuk trial.');
        }
        return ctx.reply('🔁 Silakan tekan tombol trial lagi.');
      });
      return;
    }

    if (row.has_trial === 1) {
      return ctx.reply('😅 Kamu sudah pernah ambil trial bro.');
    }

    exec('bash ./scripts/trialvmess.sh', (error, stdout, stderr) => {
      if (error) {
        logger.error('Gagal eksekusi script trialvmess:', error.message);
        return ctx.reply('❌ Gagal jalankan script trial.');
      }

      try {
        const json = JSON.parse(stdout.trim());
        const { username, uuid, ip, domain, ns_domain, city, public_key, expiration, link_tls, link_ntls, link_grpc } = json;

        db.run('UPDATE users SET has_trial = 1 WHERE user_id = ?', [userId]);
        db.run('INSERT INTO trial_logs (user_id, username, jenis, created_at) VALUES (?, ?, ?, datetime("now"))', [userId, username, 'vmess']);

        const replyText = `
🚀 *AKUN VMESS TRIAL*

👤 \`User:\` ${username}
🔐 \`UUID:\` ${uuid}
🌐 \`Domain:\` ${domain}
📍 \`Kota:\` ${city}
📡 \`NS:\` ${ns_domain}
🔑 \`PubKey:\` ${public_key}

🔌 *PORT*
443 TLS | 80/8080 NTLS | gRPC: 443

🔗 *Link*
TLS     : \`${link_tls}\`
Non-TLS : \`${link_ntls}\`
gRPC    : \`${link_grpc}\`

📆 *Expired:* ${expiration}
        `.trim();

        ctx.reply(replyText, { parse_mode: 'Markdown' });
      } catch (e) {
        logger.error('❌ Gagal parsing hasil trial VMESS:', e.message);
        ctx.reply('❌ Gagal parsing JSON VMESS.');
      }
    });
  });
});

// trial vless 
bot.action('trial_vless', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  db.get('SELECT has_trial FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('Gagal cek status trial:', err.message);
      return ctx.reply('❌ Gagal cek status trial.');
    }

    if (!row) {
      db.run('INSERT INTO users (user_id, has_trial) VALUES (?, 0)', [userId], (err) => {
        if (err) {
          logger.error('Gagal daftar user saat trial VLESS:', err.message);
          return ctx.reply('❌ Gagal simpan user untuk trial.');
        }
        return ctx.reply('🔁 Silakan tekan tombol trial lagi.');
      });
      return;
    }

    if (row.has_trial === 1) {
      return ctx.reply('😅 Kamu sudah pernah ambil trial bro.');
    }

    exec('bash ./scripts/trialvless.sh', (error, stdout, stderr) => {
      if (error) {
        logger.error('Gagal eksekusi script trialvless:', error.message);
        return ctx.reply('❌ Gagal jalankan script trial.');
      }

      try {
        const json = JSON.parse(stdout.trim());
        const { username, uuid, ip, domain, ns_domain, city, public_key, expiration, link_tls, link_ntls, link_grpc } = json;

        db.run('UPDATE users SET has_trial = 1 WHERE user_id = ?', [userId]);
        db.run('INSERT INTO trial_logs (user_id, username, jenis, created_at) VALUES (?, ?, ?, datetime("now"))', [userId, username, 'vless']);

        const replyText = `
⚡ *AKUN VLESS TRIAL*

👤 \`User:\` ${username}
🔐 \`UUID:\` ${uuid}
🌍 \`Domain:\` ${domain}
🏙️ \`Kota:\` ${city}
📡 \`NS:\` ${ns_domain}
🔑 \`PubKey:\` ${public_key}

🔌 *PORT*
TLS 443 | NTLS 80/8080 | gRPC 443

🔗 *Link*
TLS     : \`${link_tls}\`
Non-TLS : \`${link_ntls}\`
gRPC    : \`${link_grpc}\`

📆 *Expired:* ${expiration}
        `.trim();

        ctx.reply(replyText, { parse_mode: 'Markdown' });
      } catch (e) {
        logger.error('❌ Gagal parsing hasil trial VLESS:', e.message);
        ctx.reply('❌ Gagal parsing JSON VLESS.');
      }
    });
  });
});

//trial trojan
bot.action('trial_trojan', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  db.get('SELECT has_trial FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('Gagal cek status trial:', err.message);
      return ctx.reply('❌ Gagal cek status trial.');
    }

    if (!row) {
      db.run('INSERT INTO users (user_id, has_trial) VALUES (?, 0)', [userId], (err) => {
        if (err) {
          logger.error('Gagal daftar user saat trial TROJAN:', err.message);
          return ctx.reply('❌ Gagal simpan user untuk trial.');
        }
        return ctx.reply('🔁 Silakan tekan tombol trial lagi.');
      });
      return;
    }

    if (row.has_trial === 1) {
      return ctx.reply('😅 Kamu sudah pernah ambil trial bro.');
    }

    exec('bash ./scripts/trialtrojan.sh', (error, stdout, stderr) => {
      if (error) {
        logger.error('Gagal eksekusi script trialtrojan:', error.message);
        return ctx.reply('❌ Gagal jalankan script trial.');
      }

      try {
        const json = JSON.parse(stdout.trim());
        const { username, uuid, ip, domain, ns_domain, city, public_key, expiration, link_tls, link_grpc } = json;

        db.run('UPDATE users SET has_trial = 1 WHERE user_id = ?', [userId]);
        db.run('INSERT INTO trial_logs (user_id, username, jenis, created_at) VALUES (?, ?, ?, datetime("now"))', [userId, username, 'trojan']);

        const replyText = `
🌀 *AKUN TROJAN TRIAL*

👤 \`User:\` ${username}
🔐 \`UUID:\` ${uuid}
🌐 \`Domain:\` ${domain}
📍 \`Kota:\` ${city}
📡 \`NS:\` ${ns_domain}
🔑 \`PubKey:\` ${public_key}

🔌 *PORT*
WS & GRPC via 443

🔗 *Link*
TLS-WS  : \`${link_tls}\`
gRPC    : \`${link_grpc}\`

📆 *Expired:* ${expiration}
        `.trim();

        ctx.reply(replyText, { parse_mode: 'Markdown' });
      } catch (e) {
        logger.error('❌ Gagal parsing hasil trial TROJAN:', e.message);
        ctx.reply('❌ Gagal parsing JSON TROJAN.');
      }
    });
  });
});

bot.action('trial_shadowsocks', async (ctx) => {
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  db.get('SELECT has_trial FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('Gagal cek status trial:', err.message);
      return ctx.reply('❌ Gagal cek status trial.');
    }

    if (!row) {
      db.run('INSERT INTO users (user_id, has_trial) VALUES (?, 0)', [userId], (err) => {
        if (err) {
          logger.error('Gagal daftar user saat trial SHADOWSOCKS:', err.message);
          return ctx.reply('❌ Gagal simpan user untuk trial.');
        }
        return ctx.reply('🔁 Silakan tekan tombol trial lagi.');
      });
      return;
    }

    if (row.has_trial === 1) {
      return ctx.reply('😅 Kamu sudah pernah ambil trial bro.');
    }

    exec('bash ./scripts/trialshadowsocks.sh', (error, stdout, stderr) => {
      if (error) {
        logger.error('Gagal eksekusi script trialshadowsocks:', error.message);
        return ctx.reply('❌ Gagal jalankan script trial.');
      }

      try {
        const json = JSON.parse(stdout.trim());
        const { username, password, method, ip, domain, ns_domain, city, public_key, expiration, link_ws, link_grpc } = json;

        db.run('UPDATE users SET has_trial = 1 WHERE user_id = ?', [userId]);
        db.run('INSERT INTO trial_logs (user_id, username, jenis, created_at) VALUES (?, ?, ?, datetime("now"))', [userId, username, 'shadowsocks']);

        const replyText = `
🔒 *SHADOWSOCKS TRIAL*

👤 \`User:\` ${username}
🔑 \`Pass:\` ${password}
🔧 \`Method:\` ${method}
🌐 \`Domain:\` ${domain}
📍 \`Kota:\` ${city}
📡 \`NS:\` ${ns_domain}
🔑 \`PubKey:\` ${public_key}

🔌 *PORT*
443 (WS/gRPC)

🔗 *Link*
WS     : \`${link_ws}\`
gRPC   : \`${link_grpc}\`

📄 *OpenClash:* https://${domain}:81/shadowsocks-${username}.txt

📆 *Expired:* ${expiration}
        `.trim();

        ctx.reply(replyText, { parse_mode: 'Markdown' });
      } catch (e) {
        logger.error('❌ Gagal parsing hasil trial SHADOWSOCKS:', e.message);
        ctx.reply('❌ Gagal parsing JSON SHADOWSOCKS.');
      }
    });
  });
});

bot.action('send_main_menu', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await sendMainMenu(ctx);
});

// ===================== ACTION: CREATE / RENEW =====================
bot.action('create_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vmess');
});

bot.action('create_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vless');
});

bot.action('create_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'trojan');
});

bot.action('create_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'shadowsocks');
});

bot.action('create_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'ssh');
});

bot.action('renew_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vmess');
});

bot.action('renew_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vless');
});

bot.action('renew_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'trojan');
});

bot.action('renew_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'shadowsocks');
});

bot.action('renew_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'ssh');
});

async function startSelectServer(ctx, action, type, page = 0) {
  try {
    logger.info(`Memulai proses ${action} untuk ${type} di halaman ${page + 1}`);

    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        logger.error('⚠️ Error fetching servers:', err.message);
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      const serversPerPage = 6;
      const totalPages = Math.ceil(servers.length / serversPerPage);
      const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
      const start = currentPage * serversPerPage;
      const end = start + serversPerPage;
      const currentServers = servers.slice(start, end);

      const keyboard = [];
      for (let i = 0; i < currentServers.length; i += 2) {
        const row = [];
        const server1 = currentServers[i];
        const server2 = currentServers[i + 1];
        const server1Text = `${server1.nama_server}`;
        row.push({ text: server1Text, callback_data: `${action}_username_${type}_${server1.id}` });

        if (server2) {
          const server2Text = `${server2.nama_server}`;
          row.push({ text: server2Text, callback_data: `${action}_username_${type}_${server2.id}` });
        }
        keyboard.push(row);
      }

      const navButtons = [];
      if (totalPages > 1) { 
        if (currentPage > 0) {
          navButtons.push({ text: '⬅️ Back', callback_data: `navigate_${action}_${type}_${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
          navButtons.push({ text: '➡️ Next', callback_data: `navigate_${action}_${type}_${currentPage + 1}` });
        }
      }
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      const serverList = currentServers.map(server => {
  const hargaPer30Hari = server.harga * 30; 
  const isFull = server.total_create_akun >= server.batas_create_akun;

  return (
    `╭━━━❖ *INFO SERVER* ❖━━━╮\n` +
    `┃ 🌐 *Server :* ${server.nama_server}\n` +
    `┃ 💰 *Harga / Hari:* Rp${server.harga.toLocaleString()}\n` +
    `┃ 📅 *Harga / 30 Hari:* Rp${hargaPer30Hari.toLocaleString()}\n` +
    `┃ 📊 *Quota:* ${server.quota} GB\n` +
    `┃ 🔢 *Limit IP:* ${server.iplimit} IP\n` +
    `┃ 👥 *Create Akun:* ${server.total_create_akun}/${server.batas_create_akun}\n` +
    `┃ ${isFull ? '⚠️ *Status:* PENUH' : '✅ *Status:* Tersedia'}\n` +
    `╰━━━━━━━━━━━━━━━━━━╯`
  );
}).join('\n\n');

      if (ctx.updateType === 'callback_query') {
        ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      } else {
        ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      }
      userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
    });
  } catch (error) {
    logger.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply(`❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.`, { parse_mode: 'Markdown' });
  }
}

bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  const [, action, type, page] = ctx.match;
  await startSelectServer(ctx, action, type, parseInt(page, 10));
});
bot.action(/(create|renew)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const type = ctx.match[2];
  const serverId = ctx.match[3];
  userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };

  db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], async (err, server) => {
    if (err) {
      logger.error('⚠️ Error fetching server details:', err.message);
      return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
    }

    if (!server) {
      return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const batasCreateAkun = server.batas_create_akun;
    const totalCreateAkun = server.total_create_akun;

    if (totalCreateAkun >= batasCreateAkun) {
      return ctx.reply('❌ *Server penuh. Tidak dapat membuat akun baru di server ini.*', { parse_mode: 'Markdown' });
    }

    await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
  });
});

// === HANDLER create/renew akun (refactor pakai async/await) ===
bot.on('text', async (ctx) => {
  const state = userState[ctx.chat.id];

  if (!state) return; 

  if (state.step.startsWith('username_')) {
    state.username = ctx.message.text.trim();
    if (!state.username) {
      return ctx.reply('❌ *Username tidak valid. Masukkan username yang valid.*', { parse_mode: 'Markdown' });
    }
    if (state.username.length < 3 || state.username.length > 20) {
      return ctx.reply('❌ *Username harus terdiri dari 3 hingga 20 karakter.*', { parse_mode: 'Markdown' });
    }
    if (/[^a-zA-Z0-9]/.test(state.username)) {
      return ctx.reply('❌ *Username tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
    }
    const { username, serverId, type, action } = state;
    if (action === 'create') {
      if (type === 'ssh') {
        state.step = `password_${state.action}_${state.type}`;
        await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
      } else {
        state.step = `exp_${state.action}_${state.type}`;
        await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
      }
    } else if (action === 'renew') {
      state.step = `exp_${state.action}_${state.type}`;
      await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
    }
  } else if (state.step.startsWith('password_')) {
    state.password = ctx.message.text.trim();
    if (!state.password) {
      return ctx.reply('❌ *Password tidak valid. Masukkan password yang valid.*', { parse_mode: 'Markdown' });
    }
    if (state.password.length < 6) {
      return ctx.reply('❌ *Password harus terdiri dari minimal 6 karakter.*', { parse_mode: 'Markdown' });
    }
    if (/[^a-zA-Z0-9]/.test(state.password)) {
      return ctx.reply('❌ *Password tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
    }
    state.step = `exp_${state.action}_${state.type}`;
    await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
  } else if (state.step.startsWith('exp_')) {
  const expInput = ctx.message.text.trim();
  if (!/^\d+$/.test(expInput)) {
    return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }

  const durasiHari = parseInt(expInput, 10);
  if (isNaN(durasiHari) || durasiHari <= 0) {
    return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
  }
  if (durasiHari > 365) {
    return ctx.reply('❌ *Masa aktif tidak boleh lebih dari 365 hari.*', { parse_mode: 'Markdown' });
  }

   state.exp = durasiHari;

     db.get('SELECT quota, iplimit FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
    if (err || !server) {
      logger.error('⚠️ Error fetching server:', err?.message || 'Server not found');
      return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    state.quota = server.quota;
    state.iplimit = server.iplimit;

    const { username, password, exp, quota, iplimit, serverId, type, action } = state;

    db.get('SELECT harga FROM Server WHERE id = ?', [serverId], async (err, server) => {
  if (err || !server) {
    logger.error('⚠️ Error getting harga:', err?.message || 'Harga not found');
    return ctx.reply('❌ *Terjadi kesalahan saat mengambil harga server.*', { parse_mode: 'Markdown' });
  }

  db.get('SELECT saldo, role, reseller_level FROM users WHERE user_id = ?', [ctx.from.id], async (err, user) => {
    if (err || !user) {
      logger.error('⚠️ Error getting user saldo:', err?.message || 'User not found');
      return ctx.reply('❌ *Pengguna tidak ditemukan atau gagal ambil saldo.*', { parse_mode: 'Markdown' });
    }

    // 💰 Perhitungan harga & komisi
    let hargaNormal = server.harga;
    let diskon = 0;
    let komisi = 0;
    let hargaSatuan = hargaNormal;

    if (user.role === 'reseller') {
      if (user.reseller_level === 'gold') diskon = 0.2;
      else if (user.reseller_level === 'platinum') diskon = 0.3;
      else diskon = 0.1;

      hargaSatuan = Math.floor(hargaNormal * (1 - diskon));
      komisi = Math.floor(hargaNormal * exp * 0.1);
    }

    const totalHarga = hargaSatuan * exp;

    if (user.saldo < totalHarga) {
      return ctx.reply('❌ *Saldo tidak mencukupi untuk transaksi ini.*', { parse_mode: 'Markdown' });
    }

    try {
      let msg;

      if (action === 'create') {
        if (type === 'vmess') msg = await createvmess(username, exp, quota, iplimit, serverId);
        else if (type === 'vless') msg = await createvless(username, exp, quota, iplimit, serverId);
        else if (type === 'trojan') msg = await createtrojan(username, exp, quota, iplimit, serverId);
        else if (type === 'shadowsocks') msg = await createshadowsocks(username, exp, quota, iplimit, serverId);
        else if (type === 'ssh') msg = await createssh(username, password, exp, iplimit, serverId);
      } else if (action === 'renew') {
        db.get('SELECT * FROM akun_aktif WHERE username = ? AND jenis = ?', [username, type], async (err, row) => {
          if (err || !row) {
            logger.error('⚠️ Gagal cek akun aktif:', err?.message || 'Not found');
            return ctx.reply('❌ *Akun tidak ditemukan atau tidak aktif.*', { parse_mode: 'Markdown' });
          }

          if (type === 'vmess') msg = await renewvmess(username, exp, quota, iplimit, serverId);
          else if (type === 'vless') msg = await renewvless(username, exp, quota, iplimit, serverId);
          else if (type === 'trojan') msg = await renewtrojan(username, exp, quota, iplimit, serverId);
          else if (type === 'shadowsocks') msg = await renewshadowsocks(username, exp, quota, iplimit, serverId);
          else if (type === 'ssh') msg = await renewssh(username, exp, iplimit, serverId);

          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, ctx.from.id]);
          await ctx.reply(msg, { parse_mode: 'Markdown' });
          delete userState[ctx.chat.id];
        });
        return;
      }

      // ✅ Potong saldo & update jumlah akun
      db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, ctx.from.id]);
      db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId]);

      // 💰 Komisi reseller (bonus & tracking)
      if (user.role === 'reseller') {
        db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [komisi, ctx.from.id]);
        db.run(
          'INSERT INTO reseller_sales (reseller_id, buyer_id, akun_type, username, komisi, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
          [ctx.from.id, ctx.from.id, type, username, komisi]
        );

        db.get('SELECT SUM(komisi) AS total_komisi FROM reseller_sales WHERE reseller_id = ?', [ctx.from.id], (err, result) => {
          if (!result) return;
          let level = 'silver';
          if (result.total_komisi >= 250000) level = 'platinum';
          else if (result.total_komisi >= 50000) level = 'gold';
          db.run('UPDATE users SET reseller_level = ? WHERE user_id = ?', [level, ctx.from.id]);
        });

        if (typeof GROUP_ID !== 'undefined') {
          const resellerMention = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
          const notif = `📢 *Transaksi Reseller!*\n\n👤 Reseller: ${resellerMention}\n📦 ${type.toUpperCase()} - ${username}\n💰 Komisi: Rp${komisi}`;
          bot.telegram.sendMessage(GROUP_ID, notif, { parse_mode: 'Markdown' }).catch(() => {});
        }
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' });
      delete userState[ctx.chat.id];
      // 🧾 Kirim invoice ringkas ke user
            const invoiceText = `
           🧾 *INVOICE TRANSAKSI*

           👤 User: ${ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name}
           📦 Layanan: ${type.toUpperCase()}
           🔢 Username: \`${username}\`
            📅 Masa Aktif: ${exp} hari
            💸 Harga: Rp${totalHarga.toLocaleString('id-ID')}

              ${user.role === 'reseller' ? `💰 Komisi: Rp${komisi.toLocaleString('id-ID')}` : ''}
             🕒 Waktu: ${new Date().toLocaleString('id-ID')}
              `;

              await ctx.reply(invoiceText, { parse_mode: 'Markdown' });
             } catch (e) {
              logger.error('❌ Gagal proses akun:', e.message);
            return ctx.reply('❌ *Terjadi kesalahan saat membuat/renew akun.*');
    }
  });
});
  });

  } else if (state.step === 'addserver') {
    const domain = ctx.message.text.trim();
    if (!domain) {
      await ctx.reply('⚠️ *Domain tidak boleh kosong.* Silakan masukkan domain server yang valid.', { parse_mode: 'Markdown' });
      return;
    }
    state.step = 'addserver_auth';
    state.domain = domain;
    await ctx.reply('🔑 *Silakan masukkan auth server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_auth') {
    const auth = ctx.message.text.trim();
    if (!auth) {
      await ctx.reply('⚠️ *Auth tidak boleh kosong.* Silakan masukkan auth server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_nama_server';
    state.auth = auth;
    await ctx.reply('🏷️ *Silakan masukkan nama server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_nama_server') {
    const nama_server = ctx.message.text.trim();
    if (!nama_server) {
      await ctx.reply('⚠️ *Nama server tidak boleh kosong.* Silakan masukkan nama server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_quota';
    state.nama_server = nama_server;
    await ctx.reply('📊 *Silakan masukkan quota server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_quota') {
    const quota = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(quota)) {
      await ctx.reply('⚠️ *Quota tidak valid.* Silakan masukkan quota server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_iplimit';
    state.quota = quota;
    await ctx.reply('🔢 *Silakan masukkan limit IP server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_iplimit') {
    const iplimit = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(iplimit)) {
      await ctx.reply('⚠️ *Limit IP tidak valid.* Silakan masukkan limit IP server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_batas_create_akun';
    state.iplimit = iplimit;
    await ctx.reply('🔢 *Silakan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_batas_create_akun') {
    const batas_create_akun = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(batas_create_akun)) {
      await ctx.reply('⚠️ *Batas create akun tidak valid.* Silakan masukkan batas create akun server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_harga';
    state.batas_create_akun = batas_create_akun;
    await ctx.reply('💰 *Silakan masukkan harga server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_harga') {
    const harga = parseFloat(ctx.message.text.trim());
    if (isNaN(harga) || harga <= 0) {
      await ctx.reply('⚠️ *Harga tidak valid.* Silakan masukkan harga server yang valid.', { parse_mode: 'Markdown' });
      return;
    }
    const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;

    try {
      db.run('INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, 0], function(err) {
        if (err) {
          logger.error('Error saat menambahkan server:', err.message);
          ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
        } else {
          ctx.reply(`✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`, { parse_mode: 'Markdown' });
        }
      });
    } catch (error) {
      logger.error('Error saat menambahkan server:', error);
      await ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
  }
});


bot.action('addserver', async (ctx) => {
  try {
    logger.info('📥 Proses tambah server dimulai');
    await ctx.answerCbQuery();
    await ctx.reply('🌐 *Silakan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    userState[ctx.chat.id] = { step: 'addserver' };
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action('detailserver', async (ctx) => {
  try {
    logger.info('📋 Proses detail server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    const buttons = [];
    for (let i = 0; i < servers.length; i += 2) {
      const row = [];
      row.push({
        text: `${servers[i].nama_server}`,
        callback_data: `server_detail_${servers[i].id}`
      });
      if (i + 1 < servers.length) {
        row.push({
          text: `${servers[i + 1].nama_server}`,
          callback_data: `server_detail_${servers[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    await ctx.reply('📋 *Silakan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.action('listserver', async (ctx) => {
  try {
    logger.info('📜 Proses daftar server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      serverList += `🔹 ${index + 1}. ${server.domain}\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
  }
});
bot.action('resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }],
          [{ text: '❌ Tidak', callback_data: 'cancel_resetdb' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Error saat memulai proses reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('confirm_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM Server', (err) => {
        if (err) {
          logger.error('❌ Error saat mereset tabel Server:', err.message);
          return reject('❗️ *PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*');
        }
        resolve();
      });
    });
    await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat mereset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('cancel_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat membatalkan reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('deleteserver', async (ctx) => {
  try {
    logger.info('🗑️ Proses hapus server dimulai');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('⚠️ Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }

      const keyboard = servers.map(server => {
        return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali_ke_menu' }]);

      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});


// Menangani aksi untuk mengecek saldo
bot.action('cek_saldo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat memeriksa saldo:', err.message);
          return reject('❌ *Terjadi kesalahan saat memeriksa saldo Anda. Silakan coba lagi nanti.*');
        }
        resolve(row);
      });
    });

    if (row) {
      await ctx.reply(`📊 *Cek Saldo*\n\n🆔 ID Telegram: ${userId}\n💰 Sisa Saldo: Rp${row.saldo}`, 
      { 
        parse_mode: 'Markdown', 
        reply_markup: {
          inline_keyboard: [
            [{ text: '💸 Top Up', callback_data: 'topup_saldo' }, { text: '📝 Menu Utama', callback_data: 'send_main_menu' }]
          ]
        } 
      });
    } else {
      await ctx.reply('⚠️ *Anda belum memiliki saldo. Silakan tambahkan saldo terlebih dahulu.*', { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    logger.error('❌ Kesalahan saat memeriksa saldo:', error);
    await ctx.reply(`❌ *${error.message}*`, { parse_mode: 'Markdown' });
  }
});

// Fungsi untuk mengambil username berdasarkan ID
const getUsernameById = async (userId) => {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    return telegramUser.username || telegramUser.first_name;
  } catch (err) {
    logger.error('❌ Kesalahan saat mengambil username dari Telegram:', err.message);
    throw new Error('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil username dari Telegram.*');
  }
};

// Menangani callback untuk kembali ke menu utama
bot.action('send_main_menu', async (ctx) => {
  // Tampilkan menu utama disini
  await ctx.reply('📝 *Selamat datang di Menu Utama.* Silakan pilih salah satu opsi berikut:', {
    reply_markup: {
      inline_keyboard: keyboard_full() // Atau buat fungsi menu utama terpisah
    }
  });
});

bot.action('addsaldo_user', async (ctx) => {
  try {
    logger.info('Add saldo user process started');
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id FROM Users LIMIT 20', [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const currentPage = 0;
    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    if (totalUsers > 20) {
      replyMarkup.inline_keyboard.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    await ctx.reply('📊 *Silakan pilih user untuk menambahkan saldo:*', {
      reply_markup: replyMarkup,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah saldo user:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action(/next_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = currentPage * 20;

  try {
    logger.info(`Next users process started for page ${currentPage + 1}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses next users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/prev_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = (currentPage - 1) * 20; 

  try {
    logger.info(`Previous users process started for page ${currentPage}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses previous users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_limit_ip', async (ctx) => {
  try {
    logger.info('Edit server limit IP process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_limit_ip_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit limit IP:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit limit IP server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_batas_create_akun', async (ctx) => {
  try {
    logger.info('Edit server batas create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_batas_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit batas create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit batas create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_total_create_akun', async (ctx) => {
  try {
    logger.info('Edit server total create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_total_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit total create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit total create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_quota', async (ctx) => {
  try {
    logger.info('Edit server quota process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_quota_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit quota:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit quota server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_auth', async (ctx) => {
  try {
    logger.info('Edit server auth process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_auth_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silakan pilih server untuk mengedit auth:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit auth server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_harga', async (ctx) => {
  try {
    logger.info('Edit server harga process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_harga_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('💰 *Silakan pilih server untuk mengedit harga:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit harga server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_domain', async (ctx) => {
  try {
    logger.info('Edit server domain process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_domain_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silakan pilih server untuk mengedit domain:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit domain server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('nama_server_edit', async (ctx) => {
  try {
    logger.info('Edit server nama process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_nama_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🏷️ *Silakan pilih server untuk mengedit nama:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit nama server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('topup_saldo', async (ctx) => {
  try {
    await ctx.answerCbQuery(); 
    const userId = ctx.from.id;
    logger.info(`🔍 User ${userId} memulai proses top-up saldo.`);
    

    if (!global.depositState) {
      global.depositState = {};
    }
    global.depositState[userId] = { action: 'request_amount', amount: '' };
    
    logger.info(`🔍 User ${userId} diminta untuk memasukkan jumlah nominal saldo.`);
    

    const keyboard = keyboard_nomor();
    
    await ctx.editMessageText('💰 *Silakan masukkan jumlah nominal saldo yang Anda ingin tambahkan ke akun Anda:*', {
      reply_markup: {
        inline_keyboard: keyboard
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses top-up saldo:', error);
    await ctx.editMessageText('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action(/edit_harga_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit harga server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_harga', serverId: serverId };

  await ctx.reply('💰 *Silakan masukkan harga server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/add_saldo_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk menambahkan saldo user dengan ID: ${userId}`);
  userState[ctx.chat.id] = { step: 'add_saldo', userId: userId };

  await ctx.reply('📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit batas create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_batas_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan batas create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit total create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_total_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan total create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit limit IP server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_limit_ip', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan limit IP server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_quota_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit quota server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_quota', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan quota server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_auth_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit auth server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_auth', serverId: serverId };

  await ctx.reply('🌐 *Silakan masukkan auth server baru:*', {
    reply_markup: { inline_keyboard: keyboard_full() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_domain_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit domain server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_domain', serverId: serverId };

  await ctx.reply('🌐 *Silakan masukkan domain server baru:*', {
    reply_markup: { inline_keyboard: keyboard_full() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_nama_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit nama server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_nama', serverId: serverId };

  await ctx.reply('🏷️ *Silakan masukkan nama server baru:*', {
    reply_markup: { inline_keyboard: keyboard_abc() },
    parse_mode: 'Markdown'
  });
});
bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function(err) {
      if (err) {
        logger.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        logger.info('Server tidak ditemukan');
        return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      logger.info(`Server dengan ID ${ctx.match[1]} berhasil dihapus`);
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  } catch (error) {
    logger.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action(/server_detail_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(server);
      });
    });

    if (!server) {
      logger.info('⚠️ Server tidak ditemukan');
      return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const serverDetails = `📋 *Detail Server* 📋\n\n` +
      `🌐 *Domain:* \`${server.domain}\`\n` +
      `🔑 *Auth:* \`${server.auth}\`\n` +
      `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
      `📊 *Quota:* \`${server.quota}\`\n` +
      `📶 *Limit IP:* \`${server.iplimit}\`\n` +
      `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
      `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
      `💵 *Harga:* \`Rp ${server.harga}\`\n\n`;

    await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userStateData = userState[ctx.chat.id];

  if (global.depositState && global.depositState[userId] && global.depositState[userId].action === 'request_amount') {
    await handleDepositState(ctx, userId, data);
  } else if (userStateData) {
    switch (userStateData.step) {
      case 'add_saldo':
        await handleAddSaldo(ctx, userStateData, data);
        break;
      case 'edit_batas_create_akun':
        await handleEditBatasCreateAkun(ctx, userStateData, data);
        break;
      case 'edit_limit_ip':
        await handleEditiplimit(ctx, userStateData, data);
        break;
      case 'edit_quota':
        await handleEditQuota(ctx, userStateData, data);
        break;
      case 'edit_auth':
        await handleEditAuth(ctx, userStateData, data);
        break;
      case 'edit_domain':
        await handleEditDomain(ctx, userStateData, data);
        break;
      case 'edit_harga':
        await handleEditHarga(ctx, userStateData, data);
        break;
      case 'edit_nama':
        await handleEditNama(ctx, userStateData, data);
        break;
      case 'edit_total_create_akun':
        await handleEditTotalCreateAkun(ctx, userStateData, data);
        break;
    }
  }
});


async function handleDepositState(ctx, userId, data) {
  let currentAmount = global.depositState[userId].amount;

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
    }
    if (parseInt(currentAmount) < 5000) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal top-up adalah  5000 Ya Kawan...!!!', { show_alert: true });
    }
    global.depositState[userId].action = 'confirm_amount';
    await processDeposit(ctx, currentAmount);
    return;
  } else {
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ Jumlah maksimal adalah 12 digit!', { show_alert: true });
    }
  }

  global.depositState[userId].amount = currentAmount;
  const newMessage = `💰 *Silakan masukkan jumlah nominal saldo yang Anda ingin tambahkan ke akun Anda:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  
  try {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    if (error.description && error.description.includes('message is not modified')) {
      return;
    }
    logger.error('Error updating message:', error);
  }
}

async function handleAddSaldo(ctx, userStateData, data) {
  let currentSaldo = userStateData.saldo || '';

  if (data === 'delete') {
    currentSaldo = currentSaldo.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentSaldo.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak boleh kosong!*', { show_alert: true });
    }

    try {
      await updateUserSaldo(userStateData.userId, currentSaldo);
      ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${currentSaldo}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[0-9]+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak valid!*', { show_alert: true });
    }
    if (currentSaldo.length < 10) {
      currentSaldo += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo maksimal adalah 10 karakter!*', { show_alert: true });
    }
  }

  userStateData.saldo = currentSaldo;
  const newMessage = `📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah saldo saat ini: *${currentSaldo}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditBatasCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'batasCreateAkun', 'batas create akun', 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
}

async function handleEditTotalCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'totalCreateAkun', 'total create akun', 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
}

async function handleEditiplimit(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'iplimit', 'limit IP', 'UPDATE Server SET limit_ip = ? WHERE id = ?');
}

async function handleEditQuota(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'quota', 'quota', 'UPDATE Server SET quota = ? WHERE id = ?');
}

async function handleEditAuth(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'auth', 'auth', 'UPDATE Server SET auth = ? WHERE id = ?');
}

async function handleEditDomain(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'domain', 'domain', 'UPDATE Server SET domain = ? WHERE id = ?');
}

async function handleEditHarga(ctx, userStateData, data) {
  let currentAmount = userStateData.amount || '';

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah tidak boleh kosong!*', { show_alert: true });
    }
    const hargaBaru = parseFloat(currentAmount);
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      return ctx.reply('❌ *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    try {
      await updateServerField(userStateData.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
      ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^\d+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Hanya angka yang diperbolehkan!*', { show_alert: true });
    }
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah maksimal adalah 12 digit!*', { show_alert: true });
    }
  }

  userStateData.amount = currentAmount;
  const newMessage = `💰 *Silakan masukkan harga server baru:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditNama(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'name', 'nama server', 'UPDATE Server SET nama_server = ? WHERE id = ?');
}

async function handleEditField(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || '';

  if (data === 'delete') {
    currentValue = currentValue.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentValue.length === 0) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak boleh kosong!*`, { show_alert: true });
    }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: *${currentValue}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[a-zA-Z0-9.-]+$/.test(data)) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak valid!*`, { show_alert: true });
    }
    if (currentValue.length < 253) {
      currentValue += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { show_alert: true });
    }
  }

  userStateData[field] = currentValue;
  const newMessage = `📊 *Silakan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}
async function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE Users SET saldo = saldo + ? WHERE id = ?', [saldo, userId], function (err) {
      if (err) {
        logger.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function updateServerField(serverId, value, query) {
  return new Promise((resolve, reject) => {
    db.run(query, [value, serverId], function (err) {
      if (err) {
        logger.error(`⚠️ Kesalahan saat mengupdate ${fieldName} server:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function generateRandomAmount(baseAmount) {
  const random = Math.floor(Math.random() * 99) + 1;
  return baseAmount + random;
}

global.depositState = {};
global.pendingDeposits = {};
let lastRequestTime = 0;
const requestInterval = 1000; 

db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
  if (err) {
    logger.error('Gagal load pending_deposits:', err.message);
    return;
  }
  rows.forEach(row => {
    global.pendingDeposits[row.unique_code] = {
      amount: row.amount,
      originalAmount: row.original_amount,
      userId: row.user_id,
      timestamp: row.timestamp,
      status: row.status,
      qrMessageId: row.qr_message_id
    };
  });
  logger.info('Pending deposit loaded:', Object.keys(global.pendingDeposits).length);
});

const qris = new QRISPayment({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    baseQrString: DATA_QRIS,
    logoPath: 'logo.png'
});

async function processDeposit(ctx, amount) {
  const currentTime = Date.now();
  
  // Cek apakah permintaan terlalu cepat
  if (currentTime - lastRequestTime < requestInterval) {
    await ctx.reply('⚠️ *Terlalu banyak permintaan. Silakan tunggu sebentar sebelum mencoba lagi.*', { parse_mode: 'Markdown' });
    return;
  }

  lastRequestTime = currentTime;
  const userId = ctx.from.id;
  const uniqueCode = `user-${userId}-${currentTime}`;
  
  const finalAmount = generateRandomAmount(parseInt(amount));

  // Inisialisasi pendingDeposits jika belum ada
  if (!global.pendingDeposits) {
    global.pendingDeposits = {};
  }

  try {
    // Menghasilkan QR Code
    const { qrBuffer } = await qris.generateQR(finalAmount);

    // Menyusun caption untuk pesan
    const caption = 
  `╭━━━━━ 🧾 *Detail Pembayaran* ━━━━━╮\n` +
  `┃ 💰 *Jumlah:* Rp ${finalAmount.toLocaleString()}\n` +
  `┃ ⏱️ *Batas Waktu:* 5 menit\n` +
  `┃ ⚠️ *Penting:* Transfer sesuai nominal\n` +
  `╰━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +

  `📌 *Catatan Penting:*\n` +
  `• Pembayaran *otomatis terverifikasi*\n` +
  `• *Jangan tutup halaman ini* sebelum selesai\n` +
  `• Jika berhasil, *saldo akan otomatis masuk* ✅`;
                    
    // Mengirim pesan dengan QR code
    const qrMessage = await ctx.replyWithPhoto({ source: qrBuffer }, {
      caption: caption,
      parse_mode: 'Markdown',     
    });

    // Menyimpan informasi deposit yang tertunda
    global.pendingDeposits[uniqueCode] = {
      amount: finalAmount,
      originalAmount: amount,
      userId,
      timestamp: Date.now(),
      status: 'pending',
      qrMessageId: qrMessage.message_id
    };

    // Menyimpan data ke database
    await insertPendingDeposit(uniqueCode, userId, finalAmount, amount, qrMessage.message_id);

    // Menghapus state deposit pengguna
    delete global.depositState[userId];

  } catch (error) {
    logger.error('❌ Kesalahan saat memproses deposit:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
    
    // Menghapus state deposit dan pending deposit
    delete global.depositState[userId];
    delete global.pendingDeposits[uniqueCode];
    
    // Menghapus entri dari database jika ada kesalahan
    await deletePendingDeposit(uniqueCode);
  }
}

// Helper function to insert a pending deposit into the database
function insertPendingDeposit(uniqueCode, userId, finalAmount, originalAmount, qrMessageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, amount, original_amount, timestamp, status, qr_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, finalAmount, originalAmount, Date.now(), 'pending', qrMessageId],
      (err) => {
        if (err) {
          logger.error('Gagal insert pending_deposits:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

// Helper function to delete a pending deposit from the database
function deletePendingDeposit(uniqueCode) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
      if (err) {
        logger.error('Gagal hapus pending_deposits (error):', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


// Fungsi untuk membatalkan top-up (tidak perlu lagi jika tombol diubah menjadi url)
async function checkQRISStatus() {
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits);
    
    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;
      
      const depositAge = Date.now() - deposit.timestamp;
      if (depositAge > 5 * 60 * 1000) {
        try {
          if (deposit.qrMessageId) {
            await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
          }
          await bot.telegram.sendMessage(deposit.userId, 
            '⏳ *Transaksi Kadaluarsa*\n\n' +  
            '❌ Waktu pembayaran telah habis. Silakan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          logger.error('Error deleting expired payment messages:', error);
        }
        delete global.pendingDeposits[uniqueCode];
        db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
          if (err) logger.error('Gagal hapus pending_deposits (expired):', err.message);
        });
        continue;
      }

      try {
        const result = await qris.checkPayment(uniqueCode, deposit.amount);
        
        if (result.success && result.data.status === 'PAID') {
          const transactionKey = `${result.data.reference}_${result.data.amount}`;
          if (global.processedTransactions.has(transactionKey)) {
            logger.info(`Transaction ${transactionKey} already processed, skipping...`);
            continue;
          }

          if (parseInt(result.data.amount) !== deposit.amount) {
            logger.info(`Amount mismatch for ${uniqueCode}: expected ${deposit.amount}, got ${result.data.amount}`);
            continue;
          }

          const success = await processMatchingPayment(deposit, result.data, uniqueCode);
          if (success) {
            logger.info(`Payment processed successfully for ${uniqueCode}`);
            delete global.pendingDeposits[uniqueCode];
            db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
              if (err) logger.error('Gagal hapus pending_deposits (success):', err.message);
            });
          }
        }
      } catch (error) {
        logger.error(`Error checking payment status for ${uniqueCode}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error in checkQRISStatus:', error);
  }
}

function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_nomor() {
  const alphabet = '1234567890';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_full() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

global.processedTransactions = new Set();
async function updateUserBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", 
      [amount, userId],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      }
    );
  });
}

async function getUserBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT saldo FROM users WHERE user_id = ?", [userId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      }
    );
  });
}

async function sendPaymentSuccessNotification(userId, deposit, currentBalance) {
  try {
    const messageText = 
       `<b>✅ Pembayaran Berhasil!</b>\n\n` +
  `<b>📥 Detail Transaksi:</b>\n` +
  `• 💰 <b>Nominal Transfer:</b> Rp ${deposit.amount}\n` +
  `• 💳 <b>Saldo Ditambahkan:</b> Rp ${deposit.originalAmount}\n` +
  `• 🏦 <b>Saldo Saat Ini:</b> Rp ${currentBalance}\n\n` +
  `🎉 Terima kasih telah melakukan top up!\n` +
  `Gunakan saldo Anda untuk transaksi melalui bot ini.\n\n` +
  `📌 <i>Jika saldo belum masuk, silakan tunggu 1–2 menit atau hubungi admin.</i>`;

    await bot.telegram.sendMessage(userId, messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📤 Top Up', callback_data: 'topup_saldo' },
            { text: '🔙 Menu Utama', callback_data: 'send_main_menu' }
          ]
        ]
      }
    });
    return true;
  } catch (error) {
    logger.error('Error sending payment notification:', error);
    return false;
  }
}

async function processMatchingPayment(deposit, matchingTransaction, uniqueCode) {
  const transactionKey = `${matchingTransaction.reference_id}_${matchingTransaction.amount}`;
  if (global.processedTransactions.has(transactionKey)) {
    logger.info(`Transaction ${transactionKey} already processed, skipping...`);
    return false;
  }

  try {
    await updateUserBalance(deposit.userId, deposit.originalAmount);
    const userBalance = await getUserBalance(deposit.userId);
    
    if (!userBalance) {
      throw new Error('User balance not found after update');
    }
    const notificationSent = await sendPaymentSuccessNotification(
      deposit.userId,
      deposit,
      userBalance.saldo
    );

    if (notificationSent) {
      global.processedTransactions.add(transactionKey);
      delete global.pendingDeposits[uniqueCode];
      db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
        if (err) logger.error('Gagal hapus pending_deposits (success):', err.message);
      });
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('Error processing payment:', error);
    return false;
  }
}

setInterval(checkQRISStatus, 10000);

app.listen(port, () => {
  bot.launch().then(() => {
      logger.info('Bot telah dimulai');
  }).catch((error) => {
      logger.error('Error saat memulai bot:', error);
  });
  logger.info(`Server berjalan di port ${port}`);
});
