//  บอท Discord   Lei Heng Bot  -   บอท   ความปลอดภัย   การยืนยันตัวตน
require('dotenv').config();

//  Discord.js  client  intents  partials
const { Client, GatewayIntentBits, Partials } = require('discord.js');
//  ค่ากำหนด การตรวจสอบ
const { config, validateConfig } = require('./src/config');
//  การบันทึกข้อมูล ข้อผิดพลาด
const { logError } = require('./src/utils/logger');

//  ตัวจัดการเหตุการณ์  ready การเพิ่มสมาชิก การโต้ตอบ
const onReady = require('./src/events/ready');
const onGuildMemberAdd = require('./src/events/guildMemberAdd');
const onInteractionCreate = require('./src/events/interactionCreate');

//  การปิดตัวอย่างสวยงาม  ระบบ
const { initializeGracefulShutdown } = require('./src/system/gracefulShutdown');

//  การตรวจสอบค่ากำหนด
validateConfig();

//  Discord client  intents  guilds  members
const client = new Client({

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],

  partials: [Partials.Channel],

});

//  เหตุการณ์ client ready  บอท
client.once('clientReady', async (readyClient) => {

  console.log(`Logged in as ${readyClient.user.tag}`);

  try {

    await onReady(readyClient);

  } catch (err) {

    logError('ready handler error', err);

  }

});

//  เหตุการณ์การเพิ่มสมาชิก guild  การยืนยันตัวตน
client.on('guildMemberAdd', async (member) => {

  try {

    await onGuildMemberAdd(member);

  } catch (err) {

    logError('guildMemberAdd handler error', err);

  }

});

//  เหตุการณ์ interaction create  คำสั่ง
client.on('interactionCreate', async (interaction) => {

  try {

    await onInteractionCreate(interaction);

  } catch (err) {

    logError('interactionCreate handler error', err);

  }

});

//  การจัดการข้อผิดพลาด  unhandled rejections  exceptions
process.on('unhandledRejection', (reason) => {

  logError('Unhandled promise rejection', reason);

});

process.on('uncaughtException', (err) => {

  logError('Uncaught exception', err);

});

//  การเข้าสู่ระบบบอท  การเริ่มต้น
(async () => {

  try {

    await client.login(config.DISCORD_BOT_TOKEN);

    initializeGracefulShutdown(client);

  } catch (err) {

    logError('Failed to login to Discord', err);
    process.exit(1);

  }

})();