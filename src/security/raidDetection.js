
//  ค่า configuration
const { config } = require('../config');
//  การบันทึก log
const { logEvent, logError } = require('../utils/logger');
//  บริการ logging
const { logRaidDetected } = require('../utils/loggingService');
//  การแจ้งเตือน Telegram
const { sendRaidAlert } = require('../utils/telegram');
//  ระบบ lockdown
const { checkAndActivateLockdown, recordJoinForLockdown } = require('./autoLockdown');

//  การติดตามการเข้าร่วมล่าสุด
let recentJoins = [];
//  การพยายามเข้าร่วมต่อผู้ใช้
let joinAttemptsByUser = new Map();
//  สถานะการป้องกัน raid
let raidProtectionActive = false;
let antiRaidUntil = 0;

//  ค่าเกณฑ์การตรวจจับ raid
const RAID_JOIN_THRESHOLD = 15;
const RAID_TIME_WINDOW_MS = 10000;
const ANTI_RAID_DURATION_MS = 5 * 60 * 1000;
const MAX_REJOIN_ATTEMPTS = 3;

//  เปิดการป้องกัน raid slowmode
async function enableRaidProtection(guild) {
  //  ตรวจสอบว่าทำงานอยู่แล้วหรือไม่มี channel
  if (!config.WELCOME_CHANNEL_ID || raidProtectionActive) return;

  try {
    const channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    if (typeof channel.setRateLimitPerUser !== 'function') return;

    //  ตั้งค่า slowmode เป็น 10 วินาที
    await channel.setRateLimitPerUser(10, 'การป้องกัน raid เปิดใช้งาน');
    raidProtectionActive = true;

    //  บันทึกว่าเปิดการป้องกัน raid
    await logEvent(
      guild,
      'การป้องกัน raid เปิดใช้งาน',
      `Slowmode เปิดใช้งานใน welcome channel เนื่องจากการตรวจจับ raid`
    );
  } catch (err) {
    logError('enableRaidProtection', err);
  }
}

//  ล้างการพยายามเข้าร่วมเก่า
function cleanupJoinAttemptsMap() {
  const now = Date.now();
  const cutoff = now - RAID_TIME_WINDOW_MS;
  //  ลบ timestamps เก่า
  for (const [userId, timestamps] of joinAttemptsByUser.entries()) {
    const filtered = timestamps.filter((ts) => ts > cutoff);
    if (filtered.length === 0) {
      joinAttemptsByUser.delete(userId);
    } else {
      joinAttemptsByUser.set(userId, filtered);
    }
  }
}

//  ตรวจจับ raid ตามรูปแบบการเข้าร่วม
async function detectRaid(guild) {
  const now = Date.now();
  //  กรองการเข้าร่วมล่าสุดในช่วงเวลา
  recentJoins = recentJoins.filter((ts) => now - ts <= RAID_TIME_WINDOW_MS);
  cleanupJoinAttemptsMap();

  //  ตรวจสอบค่าเกณฑ์ raid
  if (recentJoins.length > RAID_JOIN_THRESHOLD) {
    const message = `🚨 RAID ALERT on ${config.SERVER_NAME}: ${recentJoins.length} users joined within ${RAID_TIME_WINDOW_MS / 1000} seconds.`;

    //  บันทึกการตรวจจับ raid
    await logEvent(guild, 'การตรวจจับ raid', message);
    await logRaidDetected(guild, recentJoins.length, RAID_TIME_WINDOW_MS / 1000);
    //  ส่งแจ้งเตือน Telegram
    await sendRaidAlert({
      joinCount: recentJoins.length,
      timeWindow: RAID_TIME_WINDOW_MS / 1000,
      guildName: guild.name
    });
    //  เปิดการป้องกัน raid
    await enableRaidProtection(guild);

    //  ตั้งค่าระยะเวลา anti-raid
    antiRaidUntil = now + ANTI_RAID_DURATION_MS;
  }

  //  ตรวจสอบการเปิด lockdown
  try {
    await checkAndActivateLockdown(guild, recentJoins.length);
  } catch (err) {
    logError('detectRaid lockdown check', err);
  }
}

//  บันทึกการเข้าร่วมสำหรับการตรวจจับ raid
async function recordJoin(guild, userId) {
  const now = Date.now();
  //  บันทึก timestamp การเข้าร่วม
  recentJoins.push(now);
  recordJoinForLockdown();

  //  ติดตามการพยายามเข้าร่วมต่อผู้ใช้
  if (userId) {
    let attempts = joinAttemptsByUser.get(userId) || [];
    attempts = attempts.filter((ts) => now - ts <= RAID_TIME_WINDOW_MS);
    attempts.push(now);
    joinAttemptsByUser.set(userId, attempts);

    //  ตรวจสอบการพยายามเข้าร่วมซ้ำ
    if (attempts.length > MAX_REJOIN_ATTEMPTS) {
      try {
        //  บันทึกการพยายามเข้าร่วมซ้ำ
        await logEvent(
          guild,
          'การตรวจจับ raid',
          `การพยายามเข้าร่วมซ้ำ: user ${userId} joined ${attempts.length} times within ${RAID_TIME_WINDOW_MS / 1000}s.`,
        );
        await logRaidDetected(guild, attempts.length, RAID_TIME_WINDOW_MS / 1000);
        //  ส่งแจ้งเตือน Telegram
        await sendRaidAlert({
          joinCount: attempts.length,
          timeWindow: RAID_TIME_WINDOW_MS / 1000,
          guildName: guild.name
        });
        //  เปิดการป้องกัน raid
        await enableRaidProtection(guild);
        antiRaidUntil = now + ANTI_RAID_DURATION_MS;
      } catch (err) {
        logError('recordJoin repeated attempts', err);
      }
    }
  }

  //  ดำเนินการตรวจจับ raid
  try {
    await detectRaid(guild);
  } catch (err) {
    logError('recordJoin detectRaid', err);
  }
}

//  ตรวจสอบว่า anti-raid ทำงานอยู่หรือไม่
function isAntiRaidActive() {
  const now = Date.now();
  //  ปิดอัตโนมัติถ้าหมดเวลา
  if (now > antiRaidUntil) {
    return false;
  }
  return true;
}

//  ตรวจสอบว่า safe mode ทำงานอยู่หรือไม่
function isSafeModeActive() {
  const { isSafeModeActive: checkSafeMode } = require('./autoLockdown');
  return checkSafeMode();
}

//  ดึงอัตราการเข้าร่วมใน 10 วินาทีล่าสุด
function getJoinRateLast10Seconds() {
  const now = Date.now();
  const cutoff = now - 10000;
  return recentJoins.filter(ts => ts > cutoff).length;
}

//  exports
module.exports = {
  recordJoin,
  isAntiRaidActive,
  isSafeModeActive,
  getJoinRateLast10Seconds,
};

