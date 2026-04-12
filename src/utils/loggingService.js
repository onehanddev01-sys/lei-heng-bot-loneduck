
//  นำเข้า logger
const { logEvent, logError } = require('./logger');

//  บันทึกเหตุการณ์ผู้ใช้เข้าร่วม
async function logUserJoined(guild, userTag, userId) {
  await logEvent(guild, 'User joined', `User joined: ${userTag} (${userId})`);
}

//  บันทึกเหตุการณ์เริ่ม captcha
async function logCaptchaStarted(guild, userTag, userId) {
  await logEvent(
    guild,
    'Captcha started',
    `User ${userTag} (${userId}) started captcha verification.`,
  );
}

//  บันทึกเหตุการณ์ captcha ผิด
async function logCaptchaFailed(guild, userTag, userId, attemptNumber, maxAttempts) {
  await logEvent(
    guild,
    'Captcha failed',
    `User ${userTag} (${userId}) failed captcha. Attempt ${attemptNumber}/${maxAttempts}.`,
  );
}

//  บันทึกเหตุการณ์ captcha สำเร็จ
async function logCaptchaSuccess(guild, userTag, userId) {
  await logEvent(
    guild,
    'Captcha success',
    `User ${userTag} (${userId}) verified successfully.`,
  );
}

//  บันทึกเหตุการณ์ผู้ใช้ถูกเตะ
async function logUserKicked(guild, userTag, userId, reason) {
  await logEvent(
    guild,
    'User kicked',
    `User ${userTag} (${userId}) was kicked. Reason: ${reason}`,
  );
}

//  บันทึกเหตุการณ์ทั่วไป
async function logGenericEvent(guild, type, description) {
  await logEvent(guild, type, description);
}

//  exports
module.exports = {
  logUserJoined,
  logCaptchaStarted,
  logCaptchaFailed,
  logCaptchaSuccess,
  logUserKicked,
  logGenericEvent,
  logError,
  //  alias สำหรับ verification
  logVerificationSuccess: logCaptchaSuccess,
  logVerificationFailure: logCaptchaFailed,
  //  บันทึกบัญชีที่น่าสงสัย
  logSuspiciousAccount: async (guild, userTag, userId, accountAge) => {
    await logEvent(guild, 'Suspicious account', `Suspicious account detected: ${userTag} (${userId}) - Account age: ${accountAge} days`);
  },
  //  บันทึกการตรวจจับ raid
  logRaidDetected: async (guild, joinCount, timeWindow) => {
    await logEvent(guild, 'Raid detected', `RAID DETECTED: ${joinCount} users joined in ${timeWindow} seconds`);
  },
};
