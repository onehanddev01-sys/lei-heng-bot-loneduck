
//  ค่า configuration
const { config } = require('../config');
//  ระบบตรวจจับ raid
const { isAntiRaidActive } = require('../security/raidDetection');
//  ระบบ lockdown
const { isLockdownActive } = require('../security/autoLockdown');
//  รีจิสทรีผู้ไม่ยืนยันตัวตน
const { unregister: unregisterUnverified } = require('../security/unverifiedRegistry');
//  บริการ logging
const {
  logCaptchaStarted,
  logCaptchaFailed,
  logCaptchaSuccess,
  logUserKicked,
  logGenericEvent,
  logError,
  logSuspiciousAccount,
} = require('../utils/loggingService');
//  การแจ้งเตือน Telegram
const { sendSuspiciousAccountAlert, sendVerificationFailureAlert, sendUserKickedAlert } = require('../utils/telegram');
//  ตัวจัดการ captcha
const {
  generateImageCaptcha,
  buildVerifyPanelEmbed,
  buildCaptchaImageReply,
  buildCaptchaModalForImage,
  validateCaptchaInput,
} = require('./captchaHandler');
//  การคืนค่า panel
const { storePanelMessage, ensurePanelExists } = require('./panelRestore');
//  การตรวจจับการใช้ captcha ผิดวิธี
const { recordCaptchaFailure, clearFailureData, applyQuarantineRole } = require('./captchaAbuseDetection');
//  การปิดระบบอย่างสมบูรณ์
const { isShuttingDownInProgress } = require('../system/gracefulShutdown');

//  ขีดจำกัดการยืนยันตัวตน
const MAX_ATTEMPTS = 3;
//  อายุ captcha 3 นาที
const CAPTCHA_LIFETIME_MS = 3 * 60 * 1000;
//  cooldown ปุ่ม 5 วินาที
const BUTTON_COOLDOWN_MS = 5_000;
//  cooldown การล้มเหลว 9 วินาที
const FAIL_COOLDOWN_MS = 9_000;
// การบล็อกหลังเตะ 1 นาที
const POST_KICK_BLOCK_MS = 60_000;
//  ขีดจำกัดการทำงานพร้อมกัน
const MAX_CONCURRENT_BUTTON_CLICKS = 25;
const MAX_CONCURRENT_SUBMISSIONS = 20;
//  จำกัดอัตราส่วนทั่วโลก
const GLOBAL_RATE_LIMIT_SUBMISSIONS = 5;
const GLOBAL_RATE_LIMIT_WINDOW_MS = 60_000;
//  การตั้งค่าคิว
const QUEUE_BATCH_SIZE = 5;
const QUEUE_PROCESS_INTERVAL_MS = 100;
//  ช่วงเวลา cleanup 1 นาที
const CLEANUP_INTERVAL_MS = 60_000;

//  เซสชันการยืนยันตัวตน
const verificationSessions = new Map();
//  บัญชีที่น่าสงสัย
const suspiciousAccounts = new Set();
//  การติดตามการคลิกปุ่ม
const lastButtonClickAt = new Map();
//  การบล็อกหลังเตะ
const postKickBlockUntil = new Map();
//  cooldown การล้มเหลว
const failCooldownUntil = new Map();
//  การพยายามของผู้ใช้
const userAttempts = new Map();
//  timestamps การส่งข้อมูล
const submissionTimestamps = new Map();

//  ตัวนับการทำงานพร้อมกัน
let concurrentButtonClicks = 0;
let concurrentSubmissions = 0;

//  คิวการยืนยันตัวตน
const verifyQueue = [];
let queueProcessing = false;

//  ดึงอายุบัญชีเป็นวัน
function getAccountAgeDays(user) {
  const now = Date.now();
  const created = user.createdAt.getTime();
  return (now - created) / (1000 * 60 * 60 * 24);
}

//  ทำเครื่องหมายผู้ใช้ว่าน่าสงสัย
function markSuspiciousUser(userId) {
  suspiciousAccounts.add(userId);
}

//  ตรวจสอบว่าผู้ใช้น่าสงสัยหรือไม่
function isSuspiciousUser(userId) {
  return suspiciousAccounts.has(userId);
}

//  ตรวจสอบจำกัดอัตราส่วนทั่วโลก
function checkGlobalRateLimit(userId) {
  const now = Date.now();
  let timestamps = submissionTimestamps.get(userId) || [];
  timestamps = timestamps.filter((ts) => now - ts < GLOBAL_RATE_LIMIT_WINDOW_MS);
  //  ตรวจสอบว่าเกินจำกัดหรือไม่
  if (timestamps.length >= GLOBAL_RATE_LIMIT_SUBMISSIONS) {
    return false;
  }
  timestamps.push(now);
  submissionTimestamps.set(userId, timestamps);
  return true;
}

//  บันทึก timestamp การส่งข้อมูล
function recordSubmission(userId) {
  const now = Date.now();
  let timestamps = submissionTimestamps.get(userId) || [];
  timestamps.push(now);
  timestamps = timestamps.filter((ts) => now - ts < GLOBAL_RATE_LIMIT_WINDOW_MS);
  submissionTimestamps.set(userId, timestamps);
}

//  ดำเนินการ cleanup เซสชัน
function runSessionCleanup() {
  const now = Date.now();
  const maxAge = CAPTCHA_LIFETIME_MS + 60_000;

  //  cleanup เซสชันที่หมดอายุ
  for (const [userId, session] of verificationSessions.entries()) {
    if (now > session.expiresAt + 60_000) {
      verificationSessions.delete(userId);
    }
  }

  //  cleanup การคลิกปุ่มเก่า
  const cutoff = now - 120_000;
  for (const [userId, ts] of lastButtonClickAt.entries()) {
    if (ts < cutoff) lastButtonClickAt.delete(userId);
  }
  for (const [userId, ts] of postKickBlockUntil.entries()) {
    if (ts < cutoff) postKickBlockUntil.delete(userId);
  }
  for (const [userId, ts] of failCooldownUntil.entries()) {
    if (ts < cutoff) failCooldownUntil.delete(userId);
  }
  //  cleanup timestamps การส่งข้อมูลเก่า
  for (const [userId, timestamps] of submissionTimestamps.entries()) {
    const filtered = timestamps.filter((t) => now - t < GLOBAL_RATE_LIMIT_WINDOW_MS);
    if (filtered.length === 0) submissionTimestamps.delete(userId);
    else submissionTimestamps.set(userId, filtered);
  }
}

//  เริ่มต้น loop cleanup เซสชัน
function startSessionCleanupLoop() {
  setInterval(() => {
    try {
      runSessionCleanup();
    } catch (err) {
      logError('sessionCleanup', err);
    }
  }, CLEANUP_INTERVAL_MS);
}

//  ส่ง panel การยืนยันตัวตน
async function sendVerifyPanel(guild) {
  //  ตรวจสอบ welcome channel
  if (!config.WELCOME_CHANNEL_ID) return;
  let channel;
  try {
    channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID);
  } catch (err) {
    logError('sendVerifyPanel', err);
    return;
  }
  //  ตรวจสอบว่า channel เป็น text based หรือไม่
  if (!channel?.isTextBased()) return;
  
  //  ตรวจสอบว่า panel มีอยู่แล้วหรือไม่
  if (await ensurePanelExists(guild)) {
    return;
  }
  //  สร้างและส่ง panel
  const { embed, components } = buildVerifyPanelEmbed();
  try {
    const message = await channel.send({ embeds: [embed], components });
    await storePanelMessage(guild.id, message.id, channel.id);
  } catch (err) {
    logError('sendVerifyPanel send', err);
  }
}

//  ดำเนินการรายการในคิวการยืนยันตัวตน
async function processQueueItem(item) {
  const { interaction } = item;
  const { guild, user } = interaction;
  const now = Date.now();

  //  บันทึกการคลิกปุ่ม
  lastButtonClickAt.set(user.id, now);

  try {
    //  ตรวจสอบว่า lockdown ทำงานอยู่หรือไม่
    const harder = isLockdownActive();
    //  สร้าง captcha
    const { buffer, text } = await generateImageCaptcha(harder);
    const expiresAt = now + CAPTCHA_LIFETIME_MS;
    //  เก็บเซสชันการยืนยันตัวตน
    verificationSessions.set(user.id, { code: text, guildId: guild.id, expiresAt });

    //  บันทึกการเริ่ม captcha
    await logCaptchaStarted(guild, user.tag, user.id);
    const payload = buildCaptchaImageReply(buffer);
    //  ส่ง captcha ไปยังผู้ใช้
    await interaction.reply({
      ...payload,
      ephemeral: true,
    });
  } catch (err) {
    logError('processQueueItem generateCaptcha', err);
    verificationSessions.delete(user.id);
    //  ตอบกลับข้อผิดพลาดเป็นภาษาไทย
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการสร้าง Captcha กรุณาลองใหม่อีกครั้ง.',
      ephemeral: true,
    });
  }
}

//  ดำเนินการคิวการยืนยันตัวตน
async function processVerifyQueue() {
  //  ตรวจสอบว่ากำลังดำเนินการหรือว่างหรือไม่
  if (queueProcessing || verifyQueue.length === 0) return;
  //  ตรวจสอบขีดจำกัดการทำงานพร้อมกัน
  if (concurrentButtonClicks >= MAX_CONCURRENT_BUTTON_CLICKS) return;

  queueProcessing = true;
  
  try {
    //  ปรับขนาด batch สำหรับ lockdown
    const batchSize = isLockdownActive() ? 2 : QUEUE_BATCH_SIZE;
    const batch = verifyQueue.splice(0, batchSize);
    //  ดำเนินการแต่ละรายการ
    for (const item of batch) {
      if (!item || !item.interaction) {
        console.warn('Invalid queue item found, skipping');
        continue;
      }
      
      //  เพิ่มตัวนับการทำงานพร้อมกัน
      concurrentButtonClicks += 1;
      try {
        await processQueueItem(item);
      } catch (err) {
        logError('processVerifyQueue item', err);
      } finally {
        //  ลดตัวนับการทำงานพร้อมกัน
        concurrentButtonClicks = Math.max(0, concurrentButtonClicks - 1);
      }
    }
  } catch (err) {
    logError('processVerifyQueue batch processing', err);
  } finally {
    queueProcessing = false;
    //  ดำเนินการต่อถ้าคิวไม่ว่าง
    if (verifyQueue.length > 0) {
      setImmediate(() => processVerifyQueue());
    }
  }
}

async function startVerification(interaction) {
  const { user } = interaction;
  const now = Date.now();

  if (isShuttingDownInProgress()) {
    await interaction.reply({
      content: '🔄 Bot is currently restarting. Please try again in a moment.',
      ephemeral: true,
    });
    return;
  }

  const blockedUntil = postKickBlockUntil.get(user.id) ?? 0;
  if (blockedUntil > now) {
    const sec = Math.ceil((blockedUntil - now) / 1000);
    await interaction.reply({
      content: `คุณเพิ่งถูกเตะออกเพราะยืนยันตัวตนไม่สำเร็จ กรุณารออีก ${sec} วินาทีก่อนลองใหม่อีกครั้ง.`,
      ephemeral: true,
    });
    return;
  }

  const cooldownUntil = failCooldownUntil.get(user.id) ?? 0;
  if (cooldownUntil > now) {
    const sec = Math.ceil((cooldownUntil - now) / 1000);
    await interaction.reply({
      content: `คุณกรอกรหัสผิดเมื่อสักครู่ กรุณารออีก ${sec} วินาทีก่อนลองใหม่.`,
      ephemeral: true,
    });
    return;
  }

  const lastClick = lastButtonClickAt.get(user.id) ?? 0;
  if (now - lastClick < BUTTON_COOLDOWN_MS) {
    const sec = Math.ceil((BUTTON_COOLDOWN_MS - (now - lastClick)) / 1000);
    await interaction.reply({
      content: `กรุณารออย่างน้อย 5 วินาทีก่อนกดปุ่มอีกครั้ง (เหลือประมาณ ${sec} วินาที)`,
      ephemeral: true,
    });
    return;
  }

  if (isAntiRaidActive()) {
    await interaction.reply({
      content:
        'ขณะนี้เซิร์ฟเวอร์อยู่ในโหมดป้องกัน Raid การยืนยันตัวตนถูกปิดชั่วคราว กรุณาลองใหม่อีกสักครู่.',
      ephemeral: true,
    });
    return;
  }

  if (isSuspiciousUser(user.id)) {
    await interaction.reply({
      content:
        'บัญชีของคุณอายุน้อยกว่า 7 วัน หรือถูกระบุว่าเสี่ยง ไม่สามารถยืนยันตัวตนได้ในขณะนี้.',
      ephemeral: true,
    });
    return;
  }

  const ageDays = getAccountAgeDays(user);
  if (ageDays < 7) {
    markSuspiciousUser(user.id);
    await logSuspiciousAccount(guild, user.tag, user.id, Math.floor(ageDays));
    await sendSuspiciousAccountAlert({
      username: user.tag,
      userId: user.id,
      accountAge: Math.floor(ageDays),
      guildName: guild.name
    });
    await interaction.reply({
      content: 'บัญชีของคุณอายุน้อยกว่า 7 วัน ไม่สามารถยืนยันตัวตนได้ในขณะนี้.',
      ephemeral: true,
    });
    return;
  }

  if (verifyQueue.length >= 500) {
    await interaction.reply({
      content: 'มีผู้ใช้ยืนยันตัวตนจำนวนมาก กรุณาลองใหม่อีกครั้งในสักครู่.',
      ephemeral: true,
    });
    return;
  }

  verifyQueue.push({ interaction, timestamp: now });
  setImmediate(() => processVerifyQueue());
}

//  จัดการปุ่มกรอกรหัส
async function handleEnterCodeButton(interaction) {
  const { guild, user } = interaction;
  const session = verificationSessions.get(user.id);
  const now = Date.now();

  //  ตรวจสอบว่ามีเซสชันอยู่หรือไม่
  if (!session) {
    await interaction.reply({
      content: 'ไม่พบเซสชันยืนยันตัวตนของคุณ กรุณากดปุ่มยืนยันตัวตนอีกครั้ง.',
      ephemeral: true,
    });
    return;
  }

  //  ตรวจสอบว่าเซสชันหมดอายุหรือไม่
  if (now > session.expiresAt) {
    verificationSessions.delete(user.id);
    await interaction.reply({
      content: 'รหัสยืนยันหมดอายุแล้ว กรุณากดปุ่มยืนยันตัวตนเพื่อขอรหัสใหม่.',
      ephemeral: true,
    });
    //  บันทึกว่า captcha หมดอายุ
    await logGenericEvent(
      guild,
      'Captcha expired',
      `User ${user.tag} (${user.id}) captcha expired`
    );
    return;
  }

  //  แสดง modal สำหรับ captcha
  const modal = buildCaptchaModalForImage();
  await interaction.showModal(modal);
}

async function handleVerificationSubmit(interaction) {
  const { guild, user } = interaction;
  const session = verificationSessions.get(user.id);
  const now = Date.now();

  if (concurrentSubmissions >= MAX_CONCURRENT_SUBMISSIONS) {
    await interaction.reply({
      content: 'มีผู้ใช้ยืนยันตัวตนจำนวนมาก กรุณาลองส่งรหัสอีกครั้งในสักครู่.',
      ephemeral: true,
    });
    return;
  }

  if (!checkGlobalRateLimit(user.id)) {
    await interaction.reply({
      content: 'คุณส่งรหัสบ่อยเกินไป กรุณารอ 1 นาทีก่อนลองใหม่.',
      ephemeral: true,
    });
    return;
  }

  concurrentSubmissions += 1;

  try {
    //  ตรวจสอบว่ามีเซสชันอยู่หรือไม่
    if (!session) {
      await interaction.reply({
        content: 'ไม่พบเซสชันยืนยันตัวตนของคุณ กรุณากดปุ่มยืนยันตัวตนอีกครั้ง.',
        ephemeral: true,
      });
      return;
    }

    //  ตรวจสอบว่าเซสชันหมดอายุหรือไม่
    if (now > session.expiresAt) {
      verificationSessions.delete(user.id);
      await interaction.reply({
        content: 'รหัสยืนยันหมดอายุแล้ว กรุณากดปุ่มยืนยันตัวตนเพื่อขอรหัสใหม่.',
        ephemeral: true,
      });
      //  บันทึกว่า captcha หมดอายุ
      await logGenericEvent(
        guild,
        'Captcha expired',
        `User ${user.tag} (${user.id}) captcha expired.`,
      );
      return;
    }

    //  ดึงและตรวจสอบข้อมูล captcha
    const rawInput = interaction.fields.getTextInputValue('captcha_code') ?? '';
    const result = validateCaptchaInput(rawInput, session.code);

    //  ตรวจสอบข้อผิดพลาดการตรวจสอบ
    if (result.errorMessage) {
      await interaction.reply({
        content: result.errorMessage,
        ephemeral: true,
      });
      return;
    }

    //  การยืนยันตัวตนสำเร็จ
    if (result.valid) {
      //  ล้างข้อมูลเซสชัน
      verificationSessions.delete(user.id);
      userAttempts.delete(user.id);
      failCooldownUntil.delete(user.id);
      suspiciousAccounts.delete(user.id);
      postKickBlockUntil.delete(user.id);
      clearFailureData(user.id);
      
      try {
        //  ดึงข้อมูลสมาชิกและมอบหมายบทบาท
        const member = await guild.members.fetch(user.id);
        //  มอบหมายบทบาทที่ยืนยันตัวตนแล้ว
        if (config.VERIFY_ROLE_ID) {
          const role =
            guild.roles.cache.get(config.VERIFY_ROLE_ID) ||
            (await guild.roles.fetch(config.VERIFY_ROLE_ID));
          if (role) await member.roles.add(role, 'Verification success');
        }
        //  ลบหมายบทบาทกักกัน
        if (config.QUARANTINE_ROLE_ID) {
          const qRole =
            guild.roles.cache.get(config.QUARANTINE_ROLE_ID) ||
            (await guild.roles.fetch(config.QUARANTINE_ROLE_ID));
          if (qRole) await member.roles.remove(qRole, 'User verified; remove quarantine');
        }
        //  ข้อความสำเร็จ
        await interaction.reply({
          content: 'ยินดีต้อนรับสู่เซิร์ฟเวอร์ ยืนยันตัวตนสำเร็จ! 🎉',
          ephemeral: true,
        });
        //  บันทึกความสำเร็จ
        await logCaptchaSuccess(guild, user.tag, user.id);
      } catch (err) {
        logError('handleVerificationSubmit success', err);
        //  ข้อความข้อผิดพลาด
        await interaction.reply({
          content: 'เกิดข้อผิดพลาดขณะให้ role กรุณาลองใหม่หรือแจ้งแอดมิน.',
          ephemeral: true,
        });
      }
      return;
    }

    const currentAttempts = (userAttempts.get(user.id) ?? 0) + 1;
    userAttempts.set(user.id, currentAttempts);

    const abuseResult = await recordCaptchaFailure(user.id, guild.id);
    
    if (abuseResult.shouldQuarantine) {
      await applyQuarantineRole(guild, user.id);
      await interaction.reply({
        content: '⚠️ คุณถูกระบบตรวจพบพฤติกรรมผิดปกติ กรุณาติดต่อแอดมินเพื่อขอความช่วยเหลือ',
        ephemeral: true,
      });
      return;
    }

    if (currentAttempts < MAX_ATTEMPTS) {
      failCooldownUntil.set(user.id, now + FAIL_COOLDOWN_MS);
      await interaction.reply({
        content: `รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง (Attempt ${currentAttempts}/${MAX_ATTEMPTS})`,
        ephemeral: true,
      });
      await logCaptchaFailed(guild, user.tag, user.id, currentAttempts, MAX_ATTEMPTS);
    await sendVerificationFailureAlert({
      username: user.tag,
      userId: user.id,
      attemptCount: currentAttempts,
      action: 'warn',
      guildName: guild.name
    });
      return;
    }

    //  ล้างเซสชันและตั้งค่าการบล็อกหลังเตะ
    verificationSessions.delete(user.id);
    userAttempts.delete(user.id);
    postKickBlockUntil.set(user.id, now + POST_KICK_BLOCK_MS);

    //  ข้อความเตะ
    await interaction.reply({
      content: 'คุณกรอกรหัสผิดครบ 3 ครั้ง ระบบจะเตะคุณออกจากเซิร์ฟเวอร์.',
      ephemeral: true,
    });
    //  บันทึกความล้มเหลวและเตะ
    await logCaptchaFailed(guild, user.tag, user.id, MAX_ATTEMPTS, MAX_ATTEMPTS);
    await logUserKicked(
      guild,
      user.tag,
      user.id,
      'ล้มเหลวในการยืนยันตัวตนหลัง 3 ครั้ง'
    );
    //  ส่งการเตะ
    await sendVerificationFailureAlert({
      username: user.tag,
      userId: user.id,
      attemptCount: MAX_ATTEMPTS,
      action: 'kick',
      guildName: guild.name
    });
    await sendUserKickedAlert({
      username: user.tag,
      userId: user.id,
      reason: 'ล้มเหลวในการยืนยันตัวตนหลัง 3 ครั้ง',
      guildName: guild.name
    });

    try {
      //  เตะผู้ใช้สำหรับการยืนยันตัวตนล้มเหลว
      const member = await guild.members.fetch(user.id);
      await member.kick('ล้มเหลวในการยืนยันตัวตนหลัง 3 ครั้ง');
    } catch (err) {
      logError('handleVerificationSubmit kick', err);
    }
  } catch (err) {
    logError('handleVerificationSubmit', err);
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการตรวจสอบรหัส กรุณาลองใหม่.',
      ephemeral: true,
    });
  } finally {
    //  ลดการยื่นข้อมูลพร้อมกัน
    concurrentSubmissions = Math.max(0, concurrentSubmissions - 1);
  }
}

//  ดึงจำนวนเซสชันการยืนยันตัวตน
function getVerificationSessionCount() {
  return verificationSessions.size;
}

// ดึงจำนวนบัญชีที่น่าสงสัย
function getSuspiciousAccountCount() {
  return suspiciousAccounts.size;
}

// exports  
module.exports = {
  sendVerifyPanel,
  startVerification,
  handleEnterCodeButton,
  handleVerificationSubmit,
  markSuspiciousUser,
  isSuspiciousUser,
  getAccountAgeDays,
  getVerificationSessionCount,
  getSuspiciousAccountCount,
};
