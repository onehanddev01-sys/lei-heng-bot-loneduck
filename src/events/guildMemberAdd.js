
//  ค่า configuration
const { config } = require('../config');
//  บริการ logging
const { logError, logUserJoined, logUserKicked, logGenericEvent, logSuspiciousAccount } = require('../utils/loggingService');
//  การแจ้งเตือน Telegram
const { sendSuspiciousAccountAlert } = require('../utils/telegram');
//  การตรวจจับ raid
const { recordJoin } = require('../security/raidDetection');
//  ระบบ lockdown
const { isLockdownActive } = require('../security/autoLockdown');
//  คิวการเข้าร่วม
const { enqueue } = require('../security/joinQueue');
//  รีจิสทรีผู้ไม่ยืนยันตัวตน
const { register: registerUnverified } = require('../security/unverifiedRegistry');
//  บริการการยืนยันตัวตน
const { markSuspiciousUser, getAccountAgeDays } = require('../verification/verificationService');

//  คำนวณคะแนนความเสี่ยงสำหรับผู้ใช้
function computeRiskScore(user) {
  let score = 0;

  const now = Date.now();
  const accountAgeMs = now - user.createdAt.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  //  บัญชีใหม่ น้อยกว่า 1 วัน
  if (accountAgeMs < oneDayMs) {
    score += 2;
  }

  //  ไม่มี avatar
  if (!user.avatar) {
    score += 1;
  }

  //  ชื่อผู้ใช้ยาว
  const username = user.username || '';
  if (username.length >= 18) {
    score += 1;
  }

  //  ชื่อผู้ใช้มีตัวเลขมาก
  const digitMatches = username.match(/\d/g) || [];
  if (digitMatches.length >= 6) {
    score += 1;
  }

  return score;
}

//  ดำเนินการสมาชิกเข้าร่วม
async function processMemberJoin(member) {
  const { guild, user } = member;

  //  บันทึกการเข้าร่วมสำหรับการตรวจจับ raid
  await recordJoin(guild, user.id);
  //  บันทึกเหตุการณ์สมาชิกเข้าร่วม
  await logUserJoined(guild, user.tag, user.id);

  //  ตรวจสอบอายุบัญชี
  const ageDays = getAccountAgeDays(user);

  //  บัญชีน่าสงสัย น้อยกว่า 7 วัน
  if (ageDays < 7) {
    //  ทำเครื่องหมายว่าน่าสงสัย
    markSuspiciousUser(user.id);
    //  บันทึกบัญชีน่าสงสัย
    await logSuspiciousAccount(guild, user.tag, user.id, Math.floor(ageDays));
    //  ส่งแจ้งเตือน Telegram
    await sendSuspiciousAccountAlert({
      username: user.tag,
      userId: user.id,
      accountAge: Math.floor(ageDays),
      guildName: guild.name
    });
  }

  //  คำนวณคะแนนความเสี่ยง
  const riskScore = computeRiskScore(user);

  //  ผู้ใช้ความเสี่ยงสูง กักกัน
  if (riskScore > 0) {
    //  เกณฑ์การกักกัน
    const shouldQuarantine = riskScore >= 3 || (isLockdownActive() && riskScore >= 2);
    if (shouldQuarantine && config.QUARANTINE_ROLE_ID) {
      try {
        const quarantineRole =
          guild.roles.cache.get(config.QUARANTINE_ROLE_ID) ||
          (await guild.roles.fetch(config.QUARANTINE_ROLE_ID));
        if (quarantineRole) {
          //  มอบหมายบทบาทกักกัน
          await member.roles.add(
            quarantineRole,
            'บัญชีความเสี่ยงสูงถูกกักกัน',
          );
        }
      } catch (err) {
        logError('processMemberJoin quarantine', err);
      }
    }
  }

  //  โหมด lockdown กักกันสมาชิกใหม่ทั้งหมด
  if (
    isLockdownActive() &&
    config.QUARANTINE_ROLE_ID &&
    !member.roles.cache.has(config.QUARANTINE_ROLE_ID)
  ) {
    try {
      const quarantineRole =
        guild.roles.cache.get(config.QUARANTINE_ROLE_ID) ||
        (await guild.roles.fetch(config.QUARANTINE_ROLE_ID));
      if (quarantineRole) {
        //  กักกันสำหรับ lockdown
        await member.roles.add(quarantineRole, 'Lockdown: verify before access');
      }
    } catch (err) {
      logError('processMemberJoin lockdown quarantine', err);
    }
  }

  //  ลงทะเบียนเป็นผู้ไม่ยืนยันตัวตน
  registerUnverified(user.id, guild.id, user.tag);
}

//  handler สำหรับเหตุการณ์ guild member add
module.exports = async function handleGuildMemberAdd(member) {
  try {
    //  ใส่ในคิวสำหรับดำเนินการ
    enqueue(member);
  } catch (err) {
    logError('guildMemberAdd handler failed', err);
  }
};

//  export ฟังก์ชันดำเนินการ
module.exports.processMemberJoin = processMemberJoin;
