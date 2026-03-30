// path: src/events/guildMemberAdd.js
//
// Handles new members joining: enqueues for batch processing, raid detection,
// suspicious account, quarantine, and 5-min verify timeout via central registry.

const { config } = require('../config');
const { logError, logUserJoined, logUserKicked, logGenericEvent, logSuspiciousAccount } = require('../utils/loggingService');
const { sendSuspiciousAccountAlert } = require('../utils/telegram');
const { recordJoin } = require('../security/raidDetection');
const { isLockdownActive } = require('../security/autoLockdown');
const { enqueue } = require('../security/joinQueue');
const { register: registerUnverified } = require('../security/unverifiedRegistry');
const { markSuspiciousUser, getAccountAgeDays } = require('../verification/verificationService');

// Compute a basic risk score for the account.
// Higher scores indicate more suspicious accounts.
function computeRiskScore(user) {
  let score = 0;

  const now = Date.now();
  const accountAgeMs = now - user.createdAt.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (accountAgeMs < oneDayMs) {
    score += 2;
  }

  if (!user.avatar) {
    score += 1;
  }

  const username = user.username || '';
  if (username.length >= 18) {
    score += 1;
  }

  const digitMatches = username.match(/\d/g) || [];
  if (digitMatches.length >= 6) {
    score += 1;
  }

  return score;
}

// Process a single member (called by join queue worker).
async function processMemberJoin(member) {
  const { guild, user } = member;

  await recordJoin(guild, user.id);
  await logUserJoined(guild, user.tag, user.id);

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
  }

  const riskScore = computeRiskScore(user);

  if (riskScore > 0) {
    // Only quarantine if risk score is high (>= 3) or during lockdown
    const shouldQuarantine = riskScore >= 3 || (isLockdownActive() && riskScore >= 2);
    if (shouldQuarantine && config.QUARANTINE_ROLE_ID) {
      try {
        const quarantineRole =
          guild.roles.cache.get(config.QUARANTINE_ROLE_ID) ||
          (await guild.roles.fetch(config.QUARANTINE_ROLE_ID));
        if (quarantineRole) {
          await member.roles.add(
            quarantineRole,
            'High risk account placed in quarantine role',
          );
        }
      } catch (err) {
        logError('Failed to assign quarantine role', err);
      }
    }
  }

  // During lockdown: all new users get quarantine until they pass captcha.
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
        await member.roles.add(quarantineRole, 'Lockdown: verify before access');
      }
    } catch (err) {
      logError('guildMemberAdd lockdown quarantine', err);
    }
  }

  // Register for 5-min auto-kick sweep (single interval, no per-user timers).
  registerUnverified(user.id, guild.id, user.tag);
}

module.exports = async function handleGuildMemberAdd(member) {
  try {
    enqueue(member);
  } catch (err) {
    logError('guildMemberAdd handler failed', err);
  }
};

module.exports.processMemberJoin = processMemberJoin;
