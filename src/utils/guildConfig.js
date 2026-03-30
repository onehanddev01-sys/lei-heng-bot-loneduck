// path: src/utils/guildConfig.js
//
// Guild configuration management: stores and retrieves per-guild settings
// from JSON database. Handles validation and persistence.

const fs = require('fs').promises;
const path = require('path');
const { logError } = require('./logger');

const CONFIG_FILE = path.join(__dirname, '../../data/guildConfig.json');

/** In-memory cache of guild configurations */
let guildConfigCache = new Map();

/**
 * Load guild configurations from disk
 */
async function loadGuildConfigs() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(data);
    guildConfigCache = new Map(Object.entries(parsed));
    console.log(`Loaded guild configurations for ${guildConfigCache.size} guilds`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logError('guildConfig loadGuildConfigs', err);
    }
    // File doesn't exist or is invalid, start fresh
    guildConfigCache = new Map();
  }
}

/**
 * Save guild configurations to disk
 */
async function saveGuildConfigs() {
  try {
    const data = Object.fromEntries(guildConfigCache);
    await fs.writeFile(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logError('guildConfig saveGuildConfigs', err);
  }
}

/**
 * Get configuration for a specific guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object>} Guild configuration object
 */
async function getGuildConfig(guildId) {
  if (!guildConfigCache.size) {
    await loadGuildConfigs();
  }
  
  return guildConfigCache.get(guildId) || {
    guild_id: guildId,
    verification_channel: null,
    log_channel: null,
    quarantine_role: null,
    verified_role: null,
  };
}

/**
 * Set configuration for a specific guild
 * @param {string} guildId - Discord guild ID
 * @param {Object} updates - Configuration updates to merge
 * @returns {Promise<void>}
 */
async function setGuildConfig(guildId, updates) {
  const existing = await getGuildConfig(guildId);
  const updated = { ...existing, ...updates, guild_id: guildId };
  guildConfigCache.set(guildId, updated);
  await saveGuildConfigs();
}

/**
 * Validate that bot can access a channel
 * @param {Guild} guild - Discord guild object
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<boolean>} True if bot can access channel
 */
async function validateChannelAccess(guild, channelId) {
  try {
    const channel = await guild.channels.fetch(channelId);
    return channel && channel.isTextBased() && channel.permissionsFor(guild.client.user).has('SendMessages');
  } catch (err) {
    return false;
  }
}

/**
 * Validate that bot can assign a role
 * @param {Guild} guild - Discord guild object
 * @param {string} roleId - Discord role ID
 * @returns {Promise<boolean>} True if bot can assign role
 */
async function validateRoleAccess(guild, roleId) {
  try {
    const role = await guild.roles.fetch(roleId);
    if (!role) return false;
    
    // Check if bot's highest role is higher than the target role
    const botRole = guild.members.me.roles.highest;
    return botRole.position > role.position || guild.ownerId === guild.client.user.id;
  } catch (err) {
    return false;
  }
}

/**
 * Get all guild configurations
 * @returns {Promise<Map<string, Object>>} Map of guild configurations
 */
async function getAllGuildConfigs() {
  if (!guildConfigCache.size) {
    await loadGuildConfigs();
  }
  return guildConfigCache;
}

/**
 * Delete configuration for a guild (when bot leaves guild)
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<void>}
 */
async function deleteGuildConfig(guildId) {
  guildConfigCache.delete(guildId);
  await saveGuildConfigs();
}

// Initialize on module load
loadGuildConfigs().catch(err => logError('guildConfig initialization', err));

module.exports = {
  getGuildConfig,
  setGuildConfig,
  getAllGuildConfigs,
  deleteGuildConfig,
  validateChannelAccess,
  validateRoleAccess,
};
