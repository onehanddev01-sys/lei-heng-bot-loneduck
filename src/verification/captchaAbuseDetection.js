
//  บริการ logging และ config
const { logError } = require('../utils/logger');
const { getGuildConfig } = require('../utils/guildConfig');

//  จัดเก็บข้อมูลการล้มเหลวของผู้ใช้
const userFailureData = new Map();

//  ค่าคงที่สำหรับการตรวจจับการใช้งาน captcha ในทางที่ผิด
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 2 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

//  บันทึกการล้มเหลวของ captcha
async function recordCaptchaFailure(userId, guildId) {
  //  ตรวจสอบพารามิเตอร์ที่ไม่ถูกต้อง
  if (!userId || typeof userId !== 'string' || !guildId || typeof guildId !== 'string') {
    console.warn('Invalid parameters passed to recordCaptchaFailure');
    return { shouldQuarantine: false, failures: 0 };
  }
  
  const now = Date.now();
  //  ดึงข้อมูลการล้มเหลวที่มีอยู่หรือสร้างข้อมูลใหม่
  const existing = userFailureData.get(userId) || { failures: 0, firstFailure: now };
  
  //  รีเซ็ตการนับถ้าหมดเวลาหน้าต่าง
  if (now - existing.firstFailure > FAILURE_WINDOW_MS) {
    existing.failures = 0;
    existing.firstFailure = now;
  }
  
  //  เพิ่มจำนวนการล้มเหลว
  existing.failures++;
  userFailureData.set(userId, existing);
  
  //  ตรวจสอบว่าควรกักกันหรือไม่
  const shouldQuarantine = existing.failures >= FAILURE_THRESHOLD;
  
  if (shouldQuarantine) {
    await flagSuspiciousUser(userId, guildId, existing.failures);
    userFailureData.delete(userId);
  }
  
  return { shouldQuarantine, failures: existing.failures };
}

//  ทำเครื่องหมายผู้ใช้ว่าน่าสงสัย
async function flagSuspiciousUser(userId, guildId, failureCount) {
  try {
    const { logGenericEvent } = require('../utils/loggingService');
    
    //  บันทึกเหตุการณ์การตรวจจับการใช้ captcha ในทางที่ผิด
    await logGenericEvent(
      { id: guildId },
      'Captcha Abuse Detected',
      `User ${userId} failed captcha ${failureCount} times in ${FAILURE_WINDOW_MS / 1000} minutes. User flagged for quarantine.`
    );
    
    //  ทำเครื่องหมายผู้ใช้ว่าน่าสงสัย
    const { markSuspiciousUser } = require('./verificationService');
    markSuspiciousUser(userId);
    
    console.log(`Captcha abuse detected: User ${userId} failed ${failureCount} times, flagged for quarantine`);
  } catch (err) {
    logError('captchaAbuseDetection flagSuspiciousUser', err);
  }
}

//  ใช้บทบาทการกักกัน
async function applyQuarantineRole(guild, userId) {
  try {
    //  ดึงค่า config ของ guild
    const config = await getGuildConfig(guild.id);
    if (!config.quarantine_role) {
      console.log(`No quarantine role configured for guild ${guild.id}`);
      return false;
    }
    
    //  ดึงข้อมูลสมาชิก
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.log(`User ${userId} not found in guild ${guild.id}`);
      return false;
    }
    
    //  เพิ่มบทบาทการกักกัน
    await member.roles.add(config.quarantine_role, 'Captcha abuse detection - automatic quarantine');
    
    //  บันทึกเหตุการณ์การใช้บทบาทการกักกัน
    const { logGenericEvent } = require('../utils/loggingService');
    await logGenericEvent(
      guild,
      'Quarantine Applied',
      `User ${member.user.tag} (${userId}) was placed in quarantine due to captcha abuse.`
    );
    
    console.log(`Applied quarantine role to user ${userId} in guild ${guild.id}`);
    return true;
  } catch (err) {
    logError('captchaAbuseDetection applyQuarantineRole', err);
    return false;
  }
}

//  ดึงจำนวนการล้มเหลว
function getFailureCount(userId) {
  const data = userFailureData.get(userId);
  if (!data) return 0;
  
  const now = Date.now();
  //  ลบข้อมูลถ้าหมดเวลาหน้าต่าง
  if (now - data.firstFailure > FAILURE_WINDOW_MS) {
    userFailureData.delete(userId);
    return 0;
  }
  
  return data.failures;
}

//  ล้างข้อมูลการล้มเหลว
function clearFailureData(userId) {
  userFailureData.delete(userId);
}

//  ล้างข้อมูลการล้มเหลวที่หมดอายุ
function cleanupFailureData() {
  const now = Date.now();
  const cutoff = now - FAILURE_WINDOW_MS;
  
  //  ลบข้อมูลที่หมดอายุ
  for (const [userId, data] of userFailureData.entries()) {
    if (data.firstFailure < cutoff) {
      userFailureData.delete(userId);
    }
  }
}

//  ดึงสถิติการใช้งานในทางที่ผิด
function getAbuseStats() {
  const now = Date.now();
  //  กรองผู้ใช้ที่ยังใช้งานอยู่ในหน้าต่างเวลา
  const activeUsers = Array.from(userFailureData.entries()).filter(([_, data]) => 
    now - data.firstFailure <= FAILURE_WINDOW_MS
  );
  
  return {
    totalTrackedUsers: userFailureData.size,
    activeUsers: activeUsers.length,
    averageFailures: activeUsers.length > 0 
      ? activeUsers.reduce((sum, [_, data]) => sum + data.failures, 0) / activeUsers.length 
      : 0
  };
}

//  ตั้งค่าการล้างข้อมูลอัตโนมัติ
setInterval(cleanupFailureData, CLEANUP_INTERVAL_MS);

//  exports
module.exports = {
  recordCaptchaFailure,
  applyQuarantineRole,
  getFailureCount,
  clearFailureData,
  getAbuseStats,
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
};
