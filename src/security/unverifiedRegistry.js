
//  ค่ากำหนด  
const { config } = require('../config');
//  บริการบันทึกข้อมูล  
const { logError, logUserKicked } = require('../utils/loggingService');

//  รีจิสทรีผู้ใช้ที่ยังไม่ยืนยันตัวตน  
const unverifiedUsers = new Map();
//  ช่วงเวลา sweep 30 วินาที  
const SWEEP_INTERVAL_MS = 30_000;
//  หมดเวลาการยืนยันตัวตน 5 นาที  
const VERIFY_TIMEOUT_MS = 5 * 60 * 1000;

//  ID ช่วงเวลา sweep  
let sweepIntervalId = null;

//  ลงทะเบียนผู้ใช้ที่ยังไม่ยืนยันตัวตน  
function register(userId, guildId, userTag) {
  unverifiedUsers.set(userId, {
    guildId,
    userTag,
    joinTime: Date.now(),
  });
}

//  ยกเลิกการลงทะเบียนผู้ใช้  
function unregister(userId) {
  unverifiedUsers.delete(userId);
}

//  sweep ผู้ใช้ที่ยังไม่ยืนยันตัวตน  ถ้าหมดเวลาจะเตะออก  
async function sweep(client) {
  const now = Date.now();
  const toKick = [];

  //  ค้นหาผู้ใช้ที่จะเตะ  หมดเวลาแล้ว  
  for (const [userId, data] of unverifiedUsers.entries()) {
    if (now - data.joinTime < VERIFY_TIMEOUT_MS) continue;
    toKick.push({ userId, ...data });
  }

  //  เตะผู้ใช้ที่ไม่ได้ยืนยันตัวตน  
  for (const { userId, guildId, userTag } of toKick) {
    unverifiedUsers.delete(userId);
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      //  ข้ามถ้ายืนยันตัวตนแล้ว  
      if (
        config.VERIFY_ROLE_ID &&
        member.roles.cache.has(config.VERIFY_ROLE_ID)
      ) {
        continue;
      }

      //  เตะผู้ใช้  
      await member.kick('Auto kick: did not verify within 5 minutes.');
      //  บันทึกการเตะ  
      await logUserKicked(
        guild,
        userTag,
        userId,
        'Did not verify within 5 minutes of joining.',
      );
    } catch (err) {
      logError('unverifiedRegistry sweep kick', err);
    }
  }
}

//  เริ่มช่วงเวลา sweep  
function startSweep(client) {
  //  ป้องกันการ sweep หลายครั้ง  
  if (sweepIntervalId) return;
  sweepIntervalId = setInterval(() => {
    sweep(client).catch((err) => logError('unverifiedRegistry sweep', err));
  }, SWEEP_INTERVAL_MS);
}

//  หยุดช่วงเวลา sweep  
function stopSweep() {
  if (sweepIntervalId) {
    clearInterval(sweepIntervalId);
    sweepIntervalId = null;
  }
}

//  ดึงจำนวนผู้ใช้ที่ยังไม่ยืนยันตัวตน  
function getCount() {
  return unverifiedUsers.size;
}

//  การส่งออกโมดูล  
module.exports = {
  register,
  unregister,
  startSweep,
  stopSweep,
  getCount,
};
