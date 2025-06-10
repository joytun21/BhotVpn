function validateEncryptKey(key) {
  if (!key) {
    console.error('❌ ENCRYPT_KEY kosong!');
    return false;
  }

  if (typeof key !== 'string') {
    console.error('❌ ENCRYPT_KEY harus berupa string!');
    return false;
  }

  if (key.length !== 32) {
    console.error(`❌ Panjang kunci salah: ${key.length} karakter. Harus 32 karakter.`);
    return false;
  }

  console.log('✅ ENCRYPT_KEY valid (32 karakter)');
  return true;
}

// === Eksekusi saat dipanggil manual ===
if (require.main === module) {
  const vars = require('../.vars.json');
  const key = vars.ENCRYPT_KEY;
  validateEncryptKey(key);
}

module.exports = validateEncryptKey;
