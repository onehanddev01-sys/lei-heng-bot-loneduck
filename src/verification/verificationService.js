// path: src/verification/verificationService.js
//
// Verification flow: image captcha, queue, rate limiting, session cleanup.
// Production-grade: handles 500+ concurrent joins, prevents memory leaks.
//
// SCALING: For horizontal scaling, verification sessions and queues would need
// a shared store (e.g. Redis) so multiple bot instances can serve the same users.

const { config } = require('../config');
const { isAntiRaidActive } = require('../security/raidDetection');
const { isLockdownActive } = require('../security/autoLockdown');
const { unregister: unregisterUnverified } = require('../security/unverifiedRegistry');
const {
  logCaptchaStarted,
  logCaptchaFailed,
  logCaptchaSuccess,
  logUserKicked,
  logGenericEvent,
  logError,
  logSuspiciousAccount,
} = require('../utils/loggingService');
const { sendSuspiciousAccountAlert, sendVerificationFailureAlert, sendUserKickedAlert } = require('../utils/telegram');
const {
  generateImageCaptcha,
  buildVerifyPanelEmbed,
  buildCaptchaImageReply,
  buildCaptchaModalForImage,
  validateCaptchaInput,
} = require('./captchaHandler');
const { storePanelMessage, ensurePanelExists } = require('./panelRestore');
const { recordCaptchaFailure, clearFailureData, applyQuarantineRole } = require('./captchaAbuseDetection');
const { isShuttingDownInProgress } = require('../system/gracefulShutdown');

// --- Constants ---
const MAX_ATTEMPTS = 3;
const CAPTCHA_LIFETIME_MS = 3 * 60 * 1000; // 3 minutes
const BUTTON_COOLDOWN_MS = 5_000;
const FAIL_COOLDOWN_MS = 9_000; // 8–10 seconds after wrong answer
const POST_KICK_BLOCK_MS = 60_000;
const MAX_CONCURRENT_BUTTON_CLICKS = 25;
const MAX_CONCURRENT_SUBMISSIONS = 20;
const GLOBAL_RATE_LIMIT_SUBMISSIONS = 5; // max per user per minute
const GLOBAL_RATE_LIMIT_WINDOW_MS = 60_000;
const QUEUE_BATCH_SIZE = 5;
const QUEUE_PROCESS_INTERVAL_MS = 100;
const CLEANUP_INTERVAL_MS = 60_000;

// --- In-memory state ---
/** userId -> { code, guildId, expiresAt } */
const verificationSessions = new Map();
const suspiciousAccounts = new Set();
const lastButtonClickAt = new Map();
const postKickBlockUntil = new Map();
const failCooldownUntil = new Map();
const userAttempts = new Map();
/** userId -> timestamps of recent submissions (for global rate limit) */
const submissionTimestamps = new Map();

// --- Rate limiting ---
let concurrentButtonClicks = 0;
let concurrentSubmissions = 0;

// --- Verification queue: process button clicks in batches to avoid overload ---
// SCALING: Could be replaced with Redis-backed queue for multi-instance deployments.
const verifyQueue = [];
let queueProcessing = false;

function getAccountAgeDays(user) {
  const now = Date.now();
  const created = user.createdAt.getTime();
  return (now - created) / (1000 * 60 * 60 * 24);
}

function markSuspiciousUser(userId) {
  suspiciousAccounts.add(userId);
}

function isSuspiciousUser(userId) {
  return suspiciousAccounts.has(userId);
}

/** Global rate limiter: max 5 submissions per minute per user. */
function checkGlobalRateLimit(userId) {
  const now = Date.now();
  let timestamps = submissionTimestamps.get(userId) || [];
  timestamps = timestamps.filter((ts) => now - ts < GLOBAL_RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= GLOBAL_RATE_LIMIT_SUBMISSIONS) {
    return false;
  }
  timestamps.push(now);
  submissionTimestamps.set(userId, timestamps);
  return true;
}

/** Record a submission for rate limiting (call when processing). */
function recordSubmission(userId) {
  const now = Date.now();
  let timestamps = submissionTimestamps.get(userId) || [];
  timestamps.push(now);
  timestamps = timestamps.filter((ts) => now - ts < GLOBAL_RATE_LIMIT_WINDOW_MS);
  submissionTimestamps.set(userId, timestamps);
}

/** Session cleanup: remove expired entries every 60 seconds to prevent memory leaks. */
function runSessionCleanup() {
  const now = Date.now();
  const maxAge = CAPTCHA_LIFETIME_MS + 60_000; // session + 1 min grace

  for (const [userId, session] of verificationSessions.entries()) {
    if (now > session.expiresAt + 60_000) {
      verificationSessions.delete(userId);
    }
  }

  // Clean old cooldown/block entries (older than 2 minutes)
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
  for (const [userId, timestamps] of submissionTimestamps.entries()) {
    const filtered = timestamps.filter((t) => now - t < GLOBAL_RATE_LIMIT_WINDOW_MS);
    if (filtered.length === 0) submissionTimestamps.delete(userId);
    else submissionTimestamps.set(userId, filtered);
  }
}

function startSessionCleanupLoop() {
  setInterval(() => {
    try {
      runSessionCleanup();
    } catch (err) {
      logError('sessionCleanup', err);
    }
  }, CLEANUP_INTERVAL_MS);
}

// --- Verify panel ---
async function sendVerifyPanel(guild) {
  if (!config.WELCOME_CHANNEL_ID) return;
  let channel;
  try {
    channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID);
  } catch (err) {
    logError('sendVerifyPanel', err);
    return;
  }
  if (!channel?.isTextBased()) return;
  
  // Check if panel already exists using restore system
  if (await ensurePanelExists(guild)) {
    return; // Panel already exists or was restored
  }
  
  // Create new panel
  const { embed, components } = buildVerifyPanelEmbed();
  try {
    const message = await channel.send({ embeds: [embed], components });
    await storePanelMessage(guild.id, message.id, channel.id);
  } catch (err) {
    logError('sendVerifyPanel send', err);
  }
}

/** Process one queued verification request. */
async function processQueueItem(item) {
  const { interaction } = item;
  const { guild, user } = interaction;
  const now = Date.now();

  lastButtonClickAt.set(user.id, now);

  try {
    const harder = isLockdownActive();
    const { buffer, text } = await generateImageCaptcha(harder);
    const expiresAt = now + CAPTCHA_LIFETIME_MS;
    verificationSessions.set(user.id, { code: text, guildId: guild.id, expiresAt });

    await logCaptchaStarted(guild, user.tag, user.id);
    const payload = buildCaptchaImageReply(buffer);
    await interaction.reply({
      ...payload,
      ephemeral: true,
    });
  } catch (err) {
    logError('processQueueItem generateCaptcha', err);
    verificationSessions.delete(user.id);
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการสร้าง Captcha กรุณาลองใหม่อีกครั้ง.',
      ephemeral: true,
    });
  }
}

/** Worker: process verification queue in batches. */
async function processVerifyQueue() {
  // Defensive coding: ensure variables are defined
  if (queueProcessing || verifyQueue.length === 0) return;
  if (concurrentButtonClicks >= MAX_CONCURRENT_BUTTON_CLICKS) return;

  queueProcessing = true;
  
  try {
    const batchSize = isLockdownActive() ? 2 : QUEUE_BATCH_SIZE;
    const batch = verifyQueue.splice(0, batchSize);
    
    // Process items safely with error handling for each item
    for (const item of batch) {
      if (!item || !item.interaction) {
        console.warn('Invalid queue item found, skipping');
        continue;
      }
      
      concurrentButtonClicks += 1;
      try {
        await processQueueItem(item);
      } catch (err) {
        logError('processVerifyQueue item', err);
      } finally {
        concurrentButtonClicks = Math.max(0, concurrentButtonClicks - 1);
      }
    }
  } catch (err) {
    logError('processVerifyQueue batch processing', err);
  } finally {
    queueProcessing = false;
    
    // Continue processing if more items remain in queue
    if (verifyQueue.length > 0) {
      setImmediate(() => processVerifyQueue());
    }
  }
}

// --- Button click: add to queue (verification queue) ---
async function startVerification(interaction) {
  const { user } = interaction;
  const now = Date.now();

  // Check if bot is shutting down
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

  // Backpressure: cap queue size to avoid memory explosion during raids
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

/** Handle "Enter code" button: show modal. */
async function handleEnterCodeButton(interaction) {
  const { guild, user } = interaction;
  const session = verificationSessions.get(user.id);
  const now = Date.now();

  if (!session) {
    await interaction.reply({
      content: 'ไม่พบเซสชันยืนยันตัวตนของคุณ กรุณากดปุ่มยืนยันตัวตนอีกครั้ง.',
      ephemeral: true,
    });
    return;
  }

  if (now > session.expiresAt) {
    verificationSessions.delete(user.id);
    await interaction.reply({
      content: 'รหัสยืนยันหมดอายุแล้ว กรุณากดปุ่มยืนยันตัวตนเพื่อขอรหัสใหม่.',
      ephemeral: true,
    });
    await logGenericEvent(
      guild,
      'Captcha expired',
      `User ${user.tag} (${user.id}) captcha expired.`,
    );
    return;
  }

  const modal = buildCaptchaModalForImage();
  await interaction.showModal(modal);
}

// --- Modal submit: validate captcha, enforce attempts and kick ---
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
    if (!session) {
      await interaction.reply({
        content: 'ไม่พบเซสชันยืนยันตัวตนของคุณ กรุณากดปุ่มยืนยันตัวตนอีกครั้ง.',
        ephemeral: true,
      });
      return;
    }

    if (now > session.expiresAt) {
      verificationSessions.delete(user.id);
      await interaction.reply({
        content: 'รหัสยืนยันหมดอายุแล้ว กรุณากดปุ่มยืนยันตัวตนเพื่อขอรหัสใหม่.',
        ephemeral: true,
      });
      await logGenericEvent(
        guild,
        'Captcha expired',
        `User ${user.tag} (${user.id}) captcha expired.`,
      );
      return;
    }

    const rawInput = interaction.fields.getTextInputValue('captcha_code') ?? '';
    const result = validateCaptchaInput(rawInput, session.code);

    if (result.errorMessage) {
      await interaction.reply({
        content: result.errorMessage,
        ephemeral: true,
      });
      return;
    }

    if (result.valid) {
      verificationSessions.delete(user.id);
      userAttempts.delete(user.id);
      failCooldownUntil.delete(user.id);
      postKickBlockUntil.delete(user.id);
      unregisterUnverified(user.id);

      // Clear abuse detection data on successful verification
      clearFailureData(user.id);
      
      try {
        const member = await guild.members.fetch(user.id);
        if (config.VERIFY_ROLE_ID) {
          const role =
            guild.roles.cache.get(config.VERIFY_ROLE_ID) ||
            (await guild.roles.fetch(config.VERIFY_ROLE_ID));
          if (role) await member.roles.add(role, 'Verification success');
        }
        if (config.QUARANTINE_ROLE_ID) {
          const qRole =
            guild.roles.cache.get(config.QUARANTINE_ROLE_ID) ||
            (await guild.roles.fetch(config.QUARANTINE_ROLE_ID));
          if (qRole && member.roles.cache.has(qRole.id)) {
            await member.roles.remove(qRole, 'User verified; remove quarantine');
          }
        }
        await interaction.reply({
          content: 'ยินดีต้อนรับสู่เซิร์ฟเวอร์ ยืนยันตัวตนสำเร็จ! 🎉',
          ephemeral: true,
        });
        await logCaptchaSuccess(guild, user.tag, user.id);
      } catch (err) {
        logError('handleVerificationSubmit success', err);
        await interaction.reply({
          content: 'เกิดข้อผิดพลาดขณะให้ role กรุณาลองใหม่หรือแจ้งแอดมิน.',
          ephemeral: true,
        });
      }
      return;
    }

    const currentAttempts = (userAttempts.get(user.id) ?? 0) + 1;
    userAttempts.set(user.id, currentAttempts);

    // Record captcha failure for abuse detection
    const abuseResult = await recordCaptchaFailure(user.id, guild.id);
    
    // Apply quarantine if abuse threshold reached
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

    verificationSessions.delete(user.id);
    userAttempts.delete(user.id);
    postKickBlockUntil.set(user.id, now + POST_KICK_BLOCK_MS);

    await interaction.reply({
      content: 'คุณกรอกรหัสผิดครบ 3 ครั้ง ระบบจะเตะคุณออกจากเซิร์ฟเวอร์.',
      ephemeral: true,
    });
    await logCaptchaFailed(guild, user.tag, user.id, MAX_ATTEMPTS, MAX_ATTEMPTS);
    await logUserKicked(
      guild,
      user.tag,
      user.id,
      'Failed captcha 3 times (Attempt 3/3).',
    );
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
      reason: 'Failed captcha 3 times',
      guildName: guild.name
    });

    try {
      const member = await guild.members.fetch(user.id);
      await member.kick('Verification failed: 3/3 attempts.');
    } catch (err) {
      logError('handleVerificationSubmit kick', err);
    }
  } finally {
    concurrentSubmissions = Math.max(0, concurrentSubmissions - 1);
  }
}

// Start cleanup loop on first load
startSessionCleanupLoop();

/** Force session cleanup (for memory guard). */
function forceSessionCleanup() {
  runSessionCleanup();
}

/** Get count of active verification sessions. */
function getVerificationSessionCount() {
  return verificationSessions.size;
}

/** Get count of suspicious accounts. */
function getSuspiciousAccountCount() {
  return suspiciousAccounts.size;
}

module.exports = {
  sendVerifyPanel,
  startVerification,
  handleEnterCodeButton,
  handleVerificationSubmit,
  markSuspiciousUser,
  isSuspiciousUser,
  getAccountAgeDays,
  forceSessionCleanup,
  getVerificationSessionCount,
  getSuspiciousAccountCount,
};
