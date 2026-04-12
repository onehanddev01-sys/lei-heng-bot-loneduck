
//  นำเข้า modules ที่จำเป็น
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { config } = require('../config');

//  กำหนดพาธของโฟลเดอร์และไฟล์ log
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

//  สร้างโฟลเดอร์ logs ถ้ายังไม่มี
function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create logs directory:', err);
  }
}

//  เรียกใช้ฟังก์ชันสร้างโฟลเดอร์
ensureLogDir();

//  เขียน log ลงไฟล์
function writeToFile(level, message) {
  //  สร้างบรรทัด log พร้อม timestamp
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
}

//  สร้าง embed สำหรับแสดง log ใน Discord
function buildLogEmbed(type, description, color) {
  return new EmbedBuilder()
    .setTitle(type)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

//  บันทึกเหตุการณ์ลงไฟล์และ Discord
async function logEvent(guild, type, description) {
  //  เขียนลงไฟล์ log
  try {
    writeToFile(type, description);
  } catch (fileErr) {
    console.error('Failed to write to log file:', fileErr);
  }

  //  ตรวจสอบว่ามี guild และ log channel id
  if (!guild || !config.LOG_CHANNEL_ID) {
    return;
  }

  try {
    let channel;
    //  ดึงข้อมูล channel จาก guild
    if (typeof guild.channels?.fetch === 'function') {
      channel = await guild.channels.fetch(config.LOG_CHANNEL_ID);
    } else {
      console.warn(`Cannot log to Discord channel: guild object missing channels.fetch method`);
      return;
    }
    
    //  ตรวจสอบว่า channel เป็น text channel
    if (!channel || !channel.isTextBased()) return;

    //  กำหนดสีตามประเภทของ log
    const colorByType = {
      'User joined': 0x3498db,
      'Captcha started': 0x3498db,
      'Captcha failed': 0xe67e22,
      'Captcha success': 0x2ecc71,
      'Verification success': 0x2ecc71,
      'Verification failed': 0xe67e22,
      'User kicked': 0xe74c3c,
      'Suspicious account': 0xf1c40f,
      'Suspicious bot-like account': 0xe67e22,
      'Raid detected': 0x9b59b6,
      'Raid protection enabled': 0xd35400,
      'Lockdown activated': 0xc0392b,
      'Captcha expired': 0x8e44ad,
      'Bot ready': 0x1abc9c,
    };

    //  เลือกสีตามประเภท ถ้าไม่มีให้ใช้สีเทา
    const color = colorByType[type] || 0x95a5a6;
    const embed = buildLogEmbed(type, description, color);

    //  ส่ง embed ไปยัง Discord channel
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to send log embed:', err);
  }
}

//  บันทึก error ลงไฟล์และ console
function logError(context, error) {
  //  จัดรูปแบบข้อความ error
  const msg =
    error instanceof Error
      ? `${context}: ${error.stack || error.message}`
      : `${context}: ${String(error)}`;

  //  เขียนลงไฟล์และ console
  writeToFile('ERROR', msg);
  console.error(msg);
}

//  exports
module.exports = {
  logEvent,
  logError,
};

