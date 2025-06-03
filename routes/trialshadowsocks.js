const { exec } = require('child_process');
const path = require('path');
const express = require('express');
const router = express.Router();

router.post('/trial/shadowsocks', async (req, res) => {
  exec(`bash ${path.resolve('scripts/trialshadowsocks')}`, (error, stdout) => {
    if (error) return res.status(500).json({ status: false, message: 'Gagal menjalankan script', error: error.message });
    try {
      const output = JSON.parse(stdout);
      res.json({ status: true, data: output });
    } catch (e) {
      res.status(500).json({ status: false, message: 'Gagal parsing output', error: e.message, raw: stdout });
    }
  });
});

module.exports = router;