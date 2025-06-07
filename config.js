const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, '.vars.json'), 'utf8');
const config = JSON.parse(raw);

module.exports = config;