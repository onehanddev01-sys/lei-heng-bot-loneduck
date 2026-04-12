
//  Discord.js  REST  routes  
const { REST, Routes } = require('discord.js');
//  ค่ากำหนด  
const { config } = require('../config');
//  การบันทึกข้อมูล  
const { logEvent, logError } = require('../utils/logger');
//  แผงการยืนยันตัวตน  
const { sendVerifyPanel } = require('../verification/verificationService');
//  โมดูลความปลอดภัย  
const { startSweep } = require('../security/unverifiedRegistry');
const { startWorker } = require('../security/joinQueue');
//  โมดูลระบบ  
const { startHealthMonitor } = require('../system/healthMonitor');
const { startMemoryGuard } = require('../system/memoryGuard');
//  การตรวจสอบแผง  
const { startPanelMonitoring } = require('../verification/panelRestore');
//  ตัวสร้างคำสั่ง  
const { buildSecurityCommand } = require('../commands/security');
const { buildSetupCommand } = require('../commands/setup');
const { buildConfigCommand } = require('../commands/config');
//  startup health check  
const { initializeStartupHealthCheck } = require('../system/startupHealthCheck');
//  ตัวจัดการการเพิ่มสมาชิก guild  
const guildMemberAdd = require('./guildMemberAdd');

//  ตัวจัดการเหตุการณ์ bot ready  
module.exports = async function onReady(client) {
  console.log(`Logged in as ${client.user.tag}`);

  //  เริ่มบริการเบื้องหลัง  
  try {
    //  เริ่มการ sweep ความปลอดภัย  
    startSweep(client);
    //  เริ่ม worker คิวการเข้าร่วม  
    startWorker(guildMemberAdd.processMemberJoin);
    //  เริ่มตัวตรวจสอบสุขภาพ  
    startHealthMonitor();
    //  เริ่ม memory guard  
    startMemoryGuard();
    //  เริ่มการตรวจสอบแผง  
    startPanelMonitoring(client);
    
    //  การตรวจสอบสุขภาพเมื่อเริ่มต้น  
    await initializeStartupHealthCheck(client);
  } catch (err) {
    logError('ready: failed to start workers', err);
  }

  //  ลงทะเบียนคำสั่ง slash  
  try {
    const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
    const commands = [
      buildSecurityCommand().toJSON(),
      buildSetupCommand().toJSON(),
      buildConfigCommand().toJSON()
    ];
    //  คำสั่ง guild หรือ global  
    const route = config.GUILD_ID
      ? Routes.applicationGuildCommands(client.user.id, config.GUILD_ID)
      : Routes.applicationCommands(client.user.id);
    await rest.put(route, { body: commands });
  } catch (err) {
    logError('ready: failed to register slash commands', err);
  }

  //  เริ่มต้นแผงการยืนยันตัวตนสำหรับ guild ที่ระบุ  
  if (config.GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(config.GUILD_ID);
      //  ส่งแผงการยืนยันตัวตน  
      await sendVerifyPanel(guild);
      //  บันทึกเหตุการณ์ bot ready  
      await logEvent(
        guild,
        'Bot ready',
        `Verification panel initialized for ${config.SERVER_NAME}.`,
      );
    } catch (err) {
      logError('Failed to send initial verify panel', err);
    }
  }
};

