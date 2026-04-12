
//  ค่า configuration
const { config } = require('../config');
//  การบันทึก log
const { logEvent, logError } = require('../utils/logger');

//  สถานะ lockdown
let lockdownActive = false;
let lockdownUntil = 0;

//  ค่าเกณฑ์ lockdown
const LOCKDOWN_JOIN_THRESHOLD = 50;
const LOCKDOWN_TIME_WINDOW_MS = 10000;
const LOCKDOWN_DURATION_MS = 120000;

//  ค่าเกณฑ์ safe mode
const SAFE_MODE_JOIN_THRESHOLD = 75;
const SAFE_MODE_DURATION_MS = 10 * 60 * 1000;

//  การติดตามการเข้าร่วมล่าสุด
let lockdownRecentJoins = [];
let safeModeActive = false;
let safeModeUntil = 0;

//  ตรวจสอบและเปิดการใช้งาน lockdown ตามจำนวนการเข้าร่วม
async function checkAndActivateLockdown(guild, recentJoinCount) {
  const now = Date.now();
  //  กรองการเข้าร่วมล่าสุดในช่วงเวลา
  lockdownRecentJoins = lockdownRecentJoins.filter(
    (ts) => now - ts <= LOCKDOWN_TIME_WINDOW_MS,
  );

  //  ตรวจสอบค่าเกณฑ์ safe mode
  if (recentJoinCount >= SAFE_MODE_JOIN_THRESHOLD && !safeModeActive) {
    await activateSafeMode(guild);
  }
  //  ตรวจสอบค่าเกณฑ์ lockdown
  else if (recentJoinCount >= LOCKDOWN_JOIN_THRESHOLD && !lockdownActive) {
    await activateLockdown(guild);
  }
  
  //  อัปเกรดเป็น safe mode ถ้ายังสูง
  if (lockdownActive && recentJoinCount >= SAFE_MODE_JOIN_THRESHOLD && !safeModeActive) {
    await activateSafeMode(guild);
  }
}

//  เปิดการใช้งานโหมด lockdown
async function activateLockdown(guild) {
  lockdownActive = true;
  lockdownUntil = Date.now() + LOCKDOWN_DURATION_MS;

  //  ข้อความ lockdown
  const message =
    `🔒 **LOCKDOWN ACTIVATED** - การโจมตีแบบ Extreme ตรวจพบ ` +
    `ผู้ใช้ใหม่ต้องทำการยืนยันตัวตนเพื่อเข้าถึงช่อง ` +
    `Lockdown จะปิดอัตโนมัติใน ${LOCKDOWN_DURATION_MS / 1000}s.`;

  //  บันทึกการเปิด lockdown
  if (guild && config.LOG_CHANNEL_ID) {
    try {
      await logEvent(guild, 'Lockdown activated', message);
      console.log(`Lockdown activated for guild ${guild?.id || 'unknown'}`);
    } catch (err) {
      logError('autoLockdown activateLockdown log', err);
    }
  }
}

//  เปิดการใช้งาน safe mode
async function activateSafeMode(guild) {
  safeModeActive = true;
  safeModeUntil = Date.now() + SAFE_MODE_DURATION_MS;

  //  ข้อความ safe mode
  const message =
    `🚨 **SAFE MODE ACTIVATED** - การโจมตีแบบ Critical ตรวจพบ ` +
    `มาตรการรักษาความปลอดภัยสูงสุดถูกเปิดใช้งาน ` +
    `Safe mode จะปิดอัตโนมัติใน ${SAFE_MODE_DURATION_MS / 1000}s.`;

  //  บันทึกการเปิด safe mode
  if (guild && config.LOG_CHANNEL_ID) {
    try {
      await logEvent(guild, 'Safe mode activated', message);
      console.log(`Safe mode activated for guild ${guild?.id || 'unknown'}`);
    } catch (err) {
      logError('autoLockdown activateSafeMode log', err);
    }
  }
}

//  ปิดการใช้งานโหมด lockdown
function deactivateLockdown() {
  lockdownActive = false;
  lockdownUntil = 0;
}

//  ปิดการใช้งาน safe mode
function deactivateSafeMode() {
  safeModeActive = false;
  safeModeUntil = 0;
}

//  ตรวจสอบว่า lockdown ทำงานอยู่หรือไม่
function isLockdownActive() {
  const now = Date.now();
  //  ปิดอัตโนมัติถ้าหมดเวลา
  if (now > lockdownUntil) {
    lockdownActive = false;
    lockdownUntil = 0;
    return false;
  }
  return lockdownActive;
}

//  ตรวจสอบว่า safe mode ทำงานอยู่หรือไม่
function isSafeModeActive() {
  const now = Date.now();
  //  ปิดอัตโนมัติถ้าหมดเวลา
  if (now > safeModeUntil) {
    safeModeActive = false;
    safeModeUntil = 0;
    return false;
  }
  return safeModeActive;
}

//  บันทึก timestamp การเข้าร่วมสำหรับการติดตาม lockdown
function recordJoinForLockdown() {
  lockdownRecentJoins.push(Date.now());
}

//  exports
module.exports = {
  activateLockdown,
  deactivateLockdown,
  isLockdownActive,
  activateSafeMode,
  deactivateSafeMode,
  isSafeModeActive,
  checkAndActivateLockdown,
  recordJoinForLockdown,
  LOCKDOWN_JOIN_THRESHOLD,
  LOCKDOWN_TIME_WINDOW_MS,
  LOCKDOWN_DURATION_MS,
  SAFE_MODE_JOIN_THRESHOLD,
  SAFE_MODE_DURATION_MS,
};
