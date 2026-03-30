// path: src/security/autoLockdown.js
//
// Auto-lockdown system: protects the server during extreme raid conditions.
// When joins exceed LOCKDOWN_JOIN_THRESHOLD within LOCKDOWN_TIME_WINDOW_MS,
// lockdown activates. During lockdown, verification is required before access;
// verification difficulty increases and queue is slowed.

const { config } = require('../config');
const { logEvent, logError } = require('../utils/logger');

let lockdownActive = false;
let lockdownUntil = 0;

/** Joins above this within LOCKDOWN_TIME_WINDOW_MS trigger lockdown. */
const LOCKDOWN_JOIN_THRESHOLD = 50;
/** Time window (ms) in which joins are counted for lockdown. */
const LOCKDOWN_TIME_WINDOW_MS = 10000;
/** How long lockdown stays active after activation. */
const LOCKDOWN_DURATION_MS = 120000;

/** Safe mode activation thresholds */
const SAFE_MODE_JOIN_THRESHOLD = 75;
const SAFE_MODE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/** Recent join timestamps for lockdown detection (separate from raid detection). */
let lockdownRecentJoins = [];
let safeModeActive = false;
let safeModeUntil = 0;

/**
 * Check if join count exceeds lockdown threshold and activate if needed.
 * Call from raidDetection after recording a join.
 * @param {Guild} guild
 * @param {number} recentJoinCount - Number of joins in the time window
 */
async function checkAndActivateLockdown(guild, recentJoinCount) {
  const now = Date.now();
  lockdownRecentJoins = lockdownRecentJoins.filter(
    (ts) => now - ts <= LOCKDOWN_TIME_WINDOW_MS,
  );

  // Check for safe mode activation first (higher threshold)
  if (recentJoinCount >= SAFE_MODE_JOIN_THRESHOLD && !safeModeActive) {
    await activateSafeMode(guild);
  }
  // Check for lockdown activation
  else if (recentJoinCount >= LOCKDOWN_JOIN_THRESHOLD && !lockdownActive) {
    await activateLockdown(guild);
  }
  
  // Continue monitoring for safe mode if lockdown is already active
  if (lockdownActive && recentJoinCount >= SAFE_MODE_JOIN_THRESHOLD && !safeModeActive) {
    await activateSafeMode(guild);
  }
}

/**
 * Activate lockdown mode. Logs to Discord and sets internal state.
 * @param {Guild} [guild] - Optional guild for log channel
 */
async function activateLockdown(guild) {
  lockdownActive = true;
  lockdownUntil = Date.now() + LOCKDOWN_DURATION_MS;

  const message =
    `🔒 **LOCKDOWN ACTIVATED** - Extreme raid detected. ` +
    `New users must complete verification before accessing channels. ` +
    `Lockdown will auto-disable in ${LOCKDOWN_DURATION_MS / 1000}s.`;

  if (guild && config.LOG_CHANNEL_ID) {
    try {
      await logEvent(guild, 'Lockdown activated', message);
      
      // Apply lockdown actions:
      // 1. Disable new member chat permissions (handled by existing role system)
      // 2. Increase captcha difficulty (handled by verification service)
      // 3. Slow verification queue (handled by join queue system)
      
      console.log(`Lockdown activated for guild ${guild?.id || 'unknown'}`);
    } catch (err) {
      logError('autoLockdown activateLockdown log', err);
    }
  }
}

/**
 * Activate safe mode when raid continues despite lockdown
 * @param {Guild} [guild] - Optional guild for log channel
 */
async function activateSafeMode(guild) {
  safeModeActive = true;
  safeModeUntil = Date.now() + SAFE_MODE_DURATION_MS;

  const message =
    `🚨 **SAFE MODE ACTIVATED** - Critical raid detected. ` +
    `Maximum security measures enabled. ` +
    `Safe mode will auto-disable in ${SAFE_MODE_DURATION_MS / 1000}s.`;

  if (guild && config.LOG_CHANNEL_ID) {
    try {
      await logEvent(guild, 'Safe mode activated', message);
      console.log(`Safe mode activated for guild ${guild?.id || 'unknown'}`);
    } catch (err) {
      logError('autoLockdown activateSafeMode log', err);
    }
  }
}

/**
 * Deactivate lockdown mode. Call manually (e.g. /security unlock) or when timer expires.
 */
function deactivateLockdown() {
  lockdownActive = false;
  lockdownUntil = 0;
}

/**
 * Deactivate safe mode manually.
 */
function deactivateSafeMode() {
  safeModeActive = false;
  safeModeUntil = 0;
}

/**
 * Check if lockdown is currently active. Call periodically to auto-expire.
 */
function isLockdownActive() {
  const now = Date.now();
  if (now > lockdownUntil) {
    lockdownActive = false;
    lockdownUntil = 0;
    return false;
  }
  return lockdownActive;
}

/**
 * Check if safe mode is currently active. Call periodically to auto-expire.
 */
function isSafeModeActive() {
  const now = Date.now();
  if (now > safeModeUntil) {
    safeModeActive = false;
    safeModeUntil = 0;
    return false;
  }
  return safeModeActive;
}

/**
 * Record a join for lockdown detection. Call from recordJoin in raidDetection.
 */
function recordJoinForLockdown() {
  lockdownRecentJoins.push(Date.now());
}

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
