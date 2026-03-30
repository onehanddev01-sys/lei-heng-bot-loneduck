// path: src/verification/captchaAbuseDetection.js
//
// Captcha abuse detection: tracks failed captcha attempts and automatically
// flags suspicious users for quarantine when they exceed failure thresholds.

const { logError } = require('../utils/logger');
const { getGuildConfig } = require('../utils/guildConfig');

/** userId -> { failures: number, firstFailure: timestamp } */
const userFailureData = new Map();

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Record a captcha failure for a user
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<{shouldQuarantine: boolean, failures: number}>}
 */
async function recordCaptchaFailure(userId, guildId) {
  // Defensive coding: validate inputs
  if (!userId || typeof userId !== 'string' || !guildId || typeof guildId !== 'string') {
    console.warn('Invalid parameters passed to recordCaptchaFailure');
    return { shouldQuarantine: false, failures: 0 };
  }
  
  const now = Date.now();
  const existing = userFailureData.get(userId) || { failures: 0, firstFailure: now };
  
  // Reset if window has expired
  if (now - existing.firstFailure > FAILURE_WINDOW_MS) {
    existing.failures = 0;
    existing.firstFailure = now;
  }
  
  existing.failures++;
  userFailureData.set(userId, existing);
  
  const shouldQuarantine = existing.failures >= FAILURE_THRESHOLD;
  
  if (shouldQuarantine) {
    await flagSuspiciousUser(userId, guildId, existing.failures);
    // Reset after quarantine
    userFailureData.delete(userId);
  }
  
  return { shouldQuarantine, failures: existing.failures };
}

/**
 * Flag a user as suspicious and apply quarantine role
 * @param {string} userId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @param {number} failureCount - Number of failures
 */
async function flagSuspiciousUser(userId, guildId, failureCount) {
  try {
    // This will be used by the verification service to apply quarantine
    const { logGenericEvent } = require('../utils/loggingService');
    
    // Log the abuse detection event
    await logGenericEvent(
      { id: guildId },
      'Captcha Abuse Detected',
      `User ${userId} failed captcha ${failureCount} times in ${FAILURE_WINDOW_MS / 1000} minutes. User flagged for quarantine.`
    );
    
    // Mark user as suspicious in verification service
    const { markSuspiciousUser } = require('./verificationService');
    markSuspiciousUser(userId);
    
    console.log(`Captcha abuse detected: User ${userId} failed ${failureCount} times, flagged for quarantine`);
  } catch (err) {
    logError('captchaAbuseDetection flagSuspiciousUser', err);
  }
}

/**
 * Apply quarantine role to a user
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - Discord user ID
 */
async function applyQuarantineRole(guild, userId) {
  try {
    const config = await getGuildConfig(guild.id);
    if (!config.quarantine_role) {
      console.log(`No quarantine role configured for guild ${guild.id}`);
      return false;
    }
    
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.log(`User ${userId} not found in guild ${guild.id}`);
      return false;
    }
    
    await member.roles.add(config.quarantine_role, 'Captcha abuse detection - automatic quarantine');
    
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

/**
 * Get failure count for a user
 * @param {string} userId - Discord user ID
 * @returns {number} Current failure count
 */
function getFailureCount(userId) {
  const data = userFailureData.get(userId);
  if (!data) return 0;
  
  const now = Date.now();
  if (now - data.firstFailure > FAILURE_WINDOW_MS) {
    userFailureData.delete(userId);
    return 0;
  }
  
  return data.failures;
}

/**
 * Clear failure data for a user (e.g., after successful verification)
 * @param {string} userId - Discord user ID
 */
function clearFailureData(userId) {
  userFailureData.delete(userId);
}

/**
 * Cleanup old failure data to prevent memory leaks
 */
function cleanupFailureData() {
  const now = Date.now();
  const cutoff = now - FAILURE_WINDOW_MS;
  
  for (const [userId, data] of userFailureData.entries()) {
    if (data.firstFailure < cutoff) {
      userFailureData.delete(userId);
    }
  }
}

/**
 * Get statistics about captcha abuse detection
 * @returns {Object} Statistics object
 */
function getAbuseStats() {
  const now = Date.now();
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

// Start cleanup interval
setInterval(cleanupFailureData, CLEANUP_INTERVAL_MS);

module.exports = {
  recordCaptchaFailure,
  applyQuarantineRole,
  getFailureCount,
  clearFailureData,
  getAbuseStats,
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS,
};
