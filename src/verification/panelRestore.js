
//  นำเข้า modules ที่จำเป็น
const fs = require('fs').promises;
const path = require('path');
const { logError, logEvent } = require('../utils/logger');
const { buildVerifyPanelEmbed } = require('./captchaHandler');

//  พาธของไฟล์เก็บข้อมูล panel
const PANEL_DATA_FILE = path.join(__dirname, '../../data/panelData.json');

//  เก็บข้อมูล panel ของ guild ต่าง ๆ
let panelData = new Map();

//  โหลดข้อมูล panel จากไฟล์
async function loadPanelData() {
  try {
    //  สร้างโฟลเดอร์ถ้ายังไม่มี
    await fs.mkdir(path.dirname(PANEL_DATA_FILE), { recursive: true });
    const data = await fs.readFile(PANEL_DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    //  แปลงข้อมูลเป็น Map
    panelData = new Map(Object.entries(parsed));
    console.log(`Loaded panel data for ${panelData.size} guilds`);
  } catch (err) {
    //  ถ้าไม่ใช่ error จากไฟล์ไม่พบ ให้ log error
    if (err.code !== 'ENOENT') {
      logError('panelRestore loadPanelData', err);
    }
    //  สร้าง Map ใหม่
    panelData = new Map();
  }
}

//  บันทึกข้อมูล panel ลงไฟล์
async function savePanelData() {
  try {
    //  สร้างโฟลเดอร์ถ้ายังไม่มี
    await fs.mkdir(path.dirname(PANEL_DATA_FILE), { recursive: true });
    //  แปลง Map เป็น Object และบันทึกลงไฟล์
    const data = Object.fromEntries(panelData);
    await fs.writeFile(PANEL_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logError('panelRestore savePanelData', err);
  }
}

//  เก็บข้อมูลข้อความ panel
async function storePanelMessage(guildId, messageId, channelId) {
  panelData.set(guildId, { messageId, channelId });
  await savePanelData();
}

//  ตรวจสอบว่า panel มีอยู่จริงหรือไม่
async function checkPanelExists(guild) {
  const guildId = guild.id;
  const panel = panelData.get(guildId);
  
  if (!panel) return false;
  
  try {
    //  ดึงข้อมูล channel
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) return false;
    
    //  ดึงข้อมูลข้อความและตรวจสอบปุ่ม verify
    const message = await channel.messages.fetch(panel.messageId);
    return message && message.components?.some((row) =>
      row.components?.some((c) => c.customId === 'verify_start')
    );
  } catch (err) {
    //  ถ้าเกิด error ให้ลบข้อมูล panel นั้น
    panelData.delete(guildId);
    await savePanelData();
    return false;
  }
}

//  ตรวจสอบและสร้าง panel ถ้าจำเป็น
async function ensurePanelExists(guild) {
  //  ถ้า panel มีอยู่แล้วให้คืนค่า true
  if (await checkPanelExists(guild)) {
    return true;
  }
  
  try {
    const { config } = require('../config');
    if (!config.WELCOME_CHANNEL_ID) return false;
    
    //  ดึงข้อมูล welcome channel
    const channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return false;
    
    //  สร้าง panel ใหม่
    const { embed, components } = buildVerifyPanelEmbed();
    const message = await channel.send({ embeds: [embed], components });
    
    //  เก็บข้อมูล panel และบันทึก log
    await storePanelMessage(guild.id, message.id, channel.id);
    await logEvent(
      guild,
      'Panel restored',
      'Verification panel was automatically recreated'
    );
    
    console.log(`Restored verification panel for guild ${guild.id}`);
    return true;
  } catch (err) {
    logError('panelRestore ensurePanelExists', err);
    return false;
  }
}

//  เริ่มต้นการตรวจสอบ panel
async function startPanelMonitoring(client) {
  await loadPanelData();
  
  //  ตรวจสอบ panel ในทุก guild
  for (const guild of client.guilds.cache.values()) {
    await ensurePanelExists(guild);
  }
  
  //  ตรวจสอบ panel ทุก 5 นาที
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await ensurePanelExists(guild);
    }
  }, 5 * 60 * 1000);
}

//  exports
module.exports = {
  storePanelMessage,
  checkPanelExists,
  ensurePanelExists,
  startPanelMonitoring,
};
