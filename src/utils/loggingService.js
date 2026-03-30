// path: src/utils/loggingService.js
//
// Centralized logging service for the captcha verification system.
// Provides semantic log methods that write to file and Discord log channel (embeds).

const { logEvent, logError } = require('./logger');

/**
 * Log when a user joins the server.
 */
async function logUserJoined(guild, userTag, userId) {
  await logEvent(guild, 'User joined', `User joined: ${userTag} (${userId})`);
}

/**
 * Log when a user starts the captcha flow (opens the verify modal).
 */
async function logCaptchaStarted(guild, userTag, userId) {
  await logEvent(
    guild,
    'Captcha started',
    `User ${userTag} (${userId}) started captcha verification.`,
  );
}

/**
 * Log when a user fails a captcha attempt. Use attemptNumber 1–3 and maxAttempts 3.
 */
async function logCaptchaFailed(guild, userTag, userId, attemptNumber, maxAttempts) {
  await logEvent(
    guild,
    'Captcha failed',
    `User ${userTag} (${userId}) failed captcha. Attempt ${attemptNumber}/${maxAttempts}.`,
  );
}

/**
 * Log when a user successfully completes captcha verification.
 */
async function logCaptchaSuccess(guild, userTag, userId) {
  await logEvent(
    guild,
    'Captcha success',
    `User ${userTag} (${userId}) verified successfully.`,
  );
}

/**
 * Log when a user is kicked (e.g. failed 3 attempts or timeout).
 */
async function logUserKicked(guild, userTag, userId, reason) {
  await logEvent(
    guild,
    'User kicked',
    `User ${userTag} (${userId}) was kicked. Reason: ${reason}`,
  );
}

/**
 * Generic event log (for raid, suspicious account, etc.).
 */
async function logGenericEvent(guild, type, description) {
  await logEvent(guild, type, description);
}

module.exports = {
  logUserJoined,
  logCaptchaStarted,
  logCaptchaFailed,
  logCaptchaSuccess,
  logUserKicked,
  logGenericEvent,
  logError,
  logVerificationSuccess: logCaptchaSuccess,
  logVerificationFailure: logCaptchaFailed,
  logSuspiciousAccount: async (guild, userTag, userId, accountAge) => {
    await logEvent(guild, 'Suspicious account', `Suspicious account detected: ${userTag} (${userId}) - Account age: ${accountAge} days`);
  },
  logRaidDetected: async (guild, joinCount, timeWindow) => {
    await logEvent(guild, 'Raid detected', `RAID DETECTED: ${joinCount} users joined in ${timeWindow} seconds`);
  },
};
