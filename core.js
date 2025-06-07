const { Telegraf } = require('telegraf');
const vars = require('./.vars.json');

const bot = new Telegraf(vars.BOT_TOKEN);
const adminIds = Array.isArray(vars.USER_ID) ? vars.USER_ID : [parseInt(vars.USER_ID)];
const GROUP_ID = vars.GROUP_ID;

module.exports = {
  bot,
  adminIds,
  GROUP_ID
};