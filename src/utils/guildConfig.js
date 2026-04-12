
//  นำเข้า modules ที่จำเป็น
const fs = require('fs').promises;
const path = require('path');
const { logError } = require('./logger');

//  กำหนดพาธของไฟล์ config
const CONFIG_FILE = path.join(__dirname, '../../data/guildConfig.json');

//  cache สำหรับเก็บ config ของ guild
let guildConfigCache = new Map();

//  โหลด config ของ guild ทั้งหมดจากไฟล์
async function loadGuildConfigs() {
  try {
    //  อ่านไฟล์ config
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);
    //  แปลงเป็น Map และเก็บใน cache
    guildConfigCache = new Map(Object.entries(parsed));
    console.log(`Loaded guild configurations for ${guildConfigCache.size} guilds`);
  } catch (err) {
    //  ถ้าไม่ใช่ error จากไฟล์ไม่พบ ให้ log error
    if (err.code !== 'ENOENT') {
      logError('guildConfig loadGuildConfigs', err);
    }
    //  สร้าง cache ใหม่
    guildConfigCache = new Map();
  }
}

//  บันทึก config ของ guild ทั้งหมดลงไฟล์
async function saveGuildConfigs() {
  try {
    //  แปลง Map เป็น Object และบันทึกลงไฟล์
    const data = Object.fromEntries(guildConfigCache);
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logError('guildConfig saveGuildConfigs', err);
  }
}

//  ดึง config ของ guild ตาม guildId
async function getGuildConfig(guildId) {
  //  ถ้า cache ว่างให้โหลด config
  if (!guildConfigCache.size) {
    await loadGuildConfigs();
  }
  
  //  คืนค่า config ถ้าไม่มีให้คืนค่าเริ่มต้น
  return guildConfigCache.get(guildId) || {
    guild_id: guildId,
    verification_channel: null,
    log_channel: null,
    quarantine_role: null,
    verified_role: null,
  };
}

//  อัปเดต config ของ guild
async function setGuildConfig(guildId, updates) {
  //  ดึง config ที่มีอยู่และรวมกับการอัปเดต
  const existing = await getGuildConfig(guildId);
  const updated = { ...existing, ...updates, guild_id: guildId };
  //  เก็บใน cache และบันทึกลงไฟล์
  guildConfigCache.set(guildId, updated);
  await saveGuildConfigs();
}

//  ตรวจสอบว่าบอทสามารถเข้าถึง channel ได้หรือไม่
async function validateChannelAccess(guild, channelId) {
  try {
    const channel = await guild.channels.fetch(channelId);
    //  ตรวจสอบว่า channel เป็น text channel และบอทมีสิทธิ์ส่งข้อความ
    return channel && channel.isTextBased() && channel.permissionsFor(guild.client.user).has('SendMessages');
  } catch (err) {
    return false;
  }
}

//  ตรวจสอบว่าบอทสามารถจัดการ role ได้หรือไม่
async function validateRoleAccess(guild, roleId) {
  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) return false;
    
    //  ตรวจสอบว่า role ของบอทสูงกว่า role ที่ต้องการจัดการ หรือบอทเป็นเจ้าของเซิร์ฟเวอร์
    const botRole = guild.members.me.roles.highest;
    return botRole.position > role.position || guild.ownerId === guild.client.user.id;
  } catch (err) {
    return false;
  }
}

//  ดึง config ของ guild ทั้งหมด
async function getAllGuildConfigs() {
  if (!guildConfigCache.size) {
    await loadGuildConfigs();
  }
  return guildConfigCache;
}

//  ลบ config ของ guild
async function deleteGuildConfig(guildId) {
  guildConfigCache.delete(guildId);
  await saveGuildConfigs();
}

//  โหลด config ตอนเริ่มต้น
loadGuildConfigs().catch(err => logError('guildConfig initialization', err));

//  exports
module.exports = {
  getGuildConfig,
  setGuildConfig,
  getAllGuildConfigs,
  deleteGuildConfig,
  validateChannelAccess,
  validateRoleAccess,
};

