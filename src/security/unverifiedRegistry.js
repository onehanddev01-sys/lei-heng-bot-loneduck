// path: src/security/unverifiedRegistry.js
//
// Central registry for unverified users. Replaces N individual setTimeout calls
// with a single sweep interval to prevent timer explosion during raids (500+ joins).

const { config } = require('../config');
const { logError, logUserKicked } = require('../utils/loggingService');

/** userId -> { guildId, userTag, joinTime } */
const unverifiedUsers = new Map();
/** Sweep interval in ms */
const SWEEP_INTERVAL_MS = 30_000; // 30 seconds
/** Kick users who haven't verified within this many ms */
const VERIFY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let sweepIntervalId = null;

/**
 * Register a user as unverified. Call when they join.
 * @param {string} userId
 * @param {string} guildId
 * @param {string} userTag
 */
function register(userId, guildId, userTag) {
  unverifiedUsers.set(userId, {
    guildId,
    userTag,
    joinTime: Date.now(),
  });
}

/**
 * Unregister a user (e.g. when they verify successfully).
 * @param {string} userId
 */
function unregister(userId) {
  unverifiedUsers.delete(userId);
}

/**
 * Single sweep: check all registered users, kick those past timeout.
 * Uses a single timer instead of 500+ timers during raids.
 */
async function sweep(client) {
  const now = Date.now();
  const toKick = [];

  for (const [userId, data] of unverifiedUsers.entries()) {
    if (now - data.joinTime < VERIFY_TIMEOUT_MS) continue;
    toKick.push({ userId, ...data });
  }

  for (const { userId, guildId, userTag } of toKick) {
    unverifiedUsers.delete(userId);
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      if (
        config.VERIFY_ROLE_ID &&
        member.roles.cache.has(config.VERIFY_ROLE_ID)
      ) {
        continue;
      }

      await member.kick('Auto kick: did not verify within 5 minutes.');
      await logUserKicked(
        guild,
        userTag,
        userId,
        'Did not verify within 5 minutes of joining.',
      );
    } catch (err) {
      logError('unverifiedRegistry sweep kick', err);
    }
  }
}

/**
 * Start the sweep interval. Call once when client is ready.
 * @param {Client} client - Discord client
 */
function startSweep(client) {
  if (sweepIntervalId) return;
  sweepIntervalId = setInterval(() => {
    sweep(client).catch((err) => logError('unverifiedRegistry sweep', err));
  }, SWEEP_INTERVAL_MS);
}

/**
 * Stop the sweep (e.g. graceful shutdown).
 */
function stopSweep() {
  if (sweepIntervalId) {
    clearInterval(sweepIntervalId);
    sweepIntervalId = null;
  }
}

function getCount() {
  return unverifiedUsers.size;
}

module.exports = {
  register,
  unregister,
  startSweep,
  stopSweep,
  getCount,
};
