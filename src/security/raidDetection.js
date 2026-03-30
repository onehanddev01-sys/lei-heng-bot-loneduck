// path: src/security/raidDetection.js
//
// In-memory raid detection: join burst detection, repeated join attempts,
// and anti-raid mode.
//
// These constants may need adjustment based on real server traffic.
// - Larger servers: higher threshold (e.g. 25–30)
// - Small servers: lower threshold (e.g. 10–12)
// - Monitor false positives during normal high-traffic events (e.g. promotions).

const { config } = require('../config');
const { logEvent, logError } = require('../utils/logger');
const { logRaidDetected } = require('../utils/loggingService');
const { sendRaidAlert } = require('../utils/telegram');
const { checkAndActivateLockdown, recordJoinForLockdown } = require('./autoLockdown');

let recentJoins = [];
/** userId -> timestamps of recent joins (for repeated join detection) */
let joinAttemptsByUser = new Map();
let raidProtectionActive = false;
let antiRaidUntil = 0;

/** Number of joins within RAID_TIME_WINDOW_MS that triggers raid mode.
 * May need adjustment based on real server traffic. */
const RAID_JOIN_THRESHOLD = 15;
/** Time window (ms) in which joins are counted.
 * May need adjustment based on normal vs raid join patterns. */
const RAID_TIME_WINDOW_MS = 10000;
/** How long anti-raid mode stays active after detection. */
const ANTI_RAID_DURATION_MS = 5 * 60 * 1000;
/** Max rejoin attempts per user within RAID_TIME_WINDOW_MS before flagging. */
const MAX_REJOIN_ATTEMPTS = 3;

// Enable slowmode in the welcome channel to reduce spam during a raid.
async function enableRaidProtection(guild) {
  if (!config.WELCOME_CHANNEL_ID || raidProtectionActive) return;

  try {
    const channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;
    if (typeof channel.setRateLimitPerUser !== 'function') return;

    await channel.setRateLimitPerUser(10, 'Raid protection enabled');
    raidProtectionActive = true;

    await logEvent(
      guild,
      'Raid protection enabled',
      'Slowmode set to 10 seconds in welcome channel due to raid detection.',
    );
  } catch (err) {
    logError('Failed to enable raid protection slowmode', err);
  }
}

/** Periodic cleanup of joinAttemptsByUser to prevent unbounded memory growth. */
function cleanupJoinAttemptsMap() {
  const now = Date.now();
  const cutoff = now - RAID_TIME_WINDOW_MS;
  for (const [userId, timestamps] of joinAttemptsByUser.entries()) {
    const filtered = timestamps.filter((ts) => ts > cutoff);
    if (filtered.length === 0) {
      joinAttemptsByUser.delete(userId);
    } else {
      joinAttemptsByUser.set(userId, filtered);
    }
  }
}

async function detectRaid(guild) {
  const now = Date.now();
  // Keep only joins within the last RAID_TIME_WINDOW_MS.
  recentJoins = recentJoins.filter((ts) => now - ts <= RAID_TIME_WINDOW_MS);
  cleanupJoinAttemptsMap();

  // Pattern 1: Mass joins within short time
  if (recentJoins.length > RAID_JOIN_THRESHOLD) {
    const message = `🚨 RAID ALERT on ${config.SERVER_NAME}: ${recentJoins.length} users joined within ${RAID_TIME_WINDOW_MS / 1000} seconds.`;

    await logEvent(guild, 'Raid detected', message);
    await logRaidDetected(guild, recentJoins.length, RAID_TIME_WINDOW_MS / 1000);
    await sendRaidAlert({
      joinCount: recentJoins.length,
      timeWindow: RAID_TIME_WINDOW_MS / 1000,
      guildName: guild.name
    });
    await enableRaidProtection(guild);

    // Mark anti-raid mode active for a limited time.
    antiRaidUntil = now + ANTI_RAID_DURATION_MS;
  }

  // Lockdown check: extreme raid (40+ joins in 10s) triggers auto-lockdown.
  try {
    await checkAndActivateLockdown(guild, recentJoins.length);
  } catch (err) {
    logError('raidDetection checkAndActivateLockdown', err);
  }
}

/**
 * Record a join event and run raid detection.
 * Tracks mass joins and repeated join attempts (same user rejoining rapidly).
 * @param {Guild} guild
 * @param {string} [userId] - Optional, for repeated join detection
 */
async function recordJoin(guild, userId) {
  const now = Date.now();
  recentJoins.push(now);
  
  // Record join for lockdown detection
  recordJoinForLockdown();

  // Pattern 2: Repeated join attempts (same user rejoining within window)
  if (userId) {
    let attempts = joinAttemptsByUser.get(userId) || [];
    attempts = attempts.filter((ts) => now - ts <= RAID_TIME_WINDOW_MS);
    attempts.push(now);
    joinAttemptsByUser.set(userId, attempts);

    if (attempts.length > MAX_REJOIN_ATTEMPTS) {
      try {
        await logEvent(
          guild,
          'Raid detected',
          `Repeated join attempts: user ${userId} joined ${attempts.length} times within ${RAID_TIME_WINDOW_MS / 1000}s.`,
        );
        await logRaidDetected(guild, attempts.length, RAID_TIME_WINDOW_MS / 1000);
        await sendRaidAlert({
          joinCount: attempts.length,
          timeWindow: RAID_TIME_WINDOW_MS / 1000,
          guildName: guild.name
        });
        await enableRaidProtection(guild);
        antiRaidUntil = now + ANTI_RAID_DURATION_MS;
      } catch (err) {
        logError('raidDetection recordJoin repeated', err);
      }
    }
  }

  try {
    await detectRaid(guild);
  } catch (err) {
    logError('raidDetection detectRaid', err);
  }
}

function isAntiRaidActive() {
  const now = Date.now();
  if (now > antiRaidUntil) {
    return false;
  }
  return true;
}

function isSafeModeActive() {
  // Use the real safe mode status from autoLockdown
  const { isSafeModeActive: checkSafeMode } = require('./autoLockdown');
  return checkSafeMode();
}

function getJoinRateLast10Seconds() {
  const now = Date.now();
  const cutoff = now - 10000;
  return recentJoins.filter(ts => ts > cutoff).length;
}

module.exports = {
  recordJoin,
  isAntiRaidActive,
  isSafeModeActive,
  getJoinRateLast10Seconds,
};

