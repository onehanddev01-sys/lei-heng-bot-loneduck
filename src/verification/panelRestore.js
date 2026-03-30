// path: src/verification/panelRestore.js
//
// Verification panel restore system: persists panel message IDs and automatically
// recreates verification panels if they're deleted. Ensures panel persistence across
// bot restarts and message deletions.

const fs = require('fs').promises;
const path = require('path');
const { logError, logEvent } = require('../utils/logger');
const { buildVerifyPanelEmbed } = require('./captchaHandler');

const PANEL_DATA_FILE = path.join(__dirname, '../../data/panelData.json');

/** guildId -> { messageId, channelId } */
let panelData = new Map();

/**
 * Load panel data from disk on startup
 */
async function loadPanelData() {
  try {
    // Ensure directory exists before reading
    await fs.mkdir(path.dirname(PANEL_DATA_FILE), { recursive: true });
    const data = await fs.readFile(PANEL_DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    panelData = new Map(Object.entries(parsed));
    console.log(`Loaded panel data for ${panelData.size} guilds`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logError('panelRestore loadPanelData', err);
    }
    // File doesn't exist or is invalid, start fresh
    panelData = new Map();
  }
}

/**
 * Save panel data to disk
 */
async function savePanelData() {
  try {
    // Ensure directory exists before writing
    await fs.mkdir(path.dirname(PANEL_DATA_FILE), { recursive: true });
    const data = Object.fromEntries(panelData);
    await fs.writeFile(PANEL_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logError('panelRestore savePanelData', err);
  }
}

/**
 * Store panel message information
 */
async function storePanelMessage(guildId, messageId, channelId) {
  panelData.set(guildId, { messageId, channelId });
  await savePanelData();
}

/**
 * Check if panel exists and is valid
 */
async function checkPanelExists(guild) {
  const guildId = guild.id;
  const panel = panelData.get(guildId);
  
  if (!panel) return false;
  
  try {
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) return false;
    
    const message = await channel.messages.fetch(panel.messageId);
    return message && message.components?.some((row) =>
      row.components?.some((c) => c.customId === 'verify_start')
    );
  } catch (err) {
    // Message doesn't exist or can't be accessed
    panelData.delete(guildId);
    await savePanelData();
    return false;
  }
}

/**
 * Restore verification panel if it doesn't exist
 */
async function ensurePanelExists(guild) {
  if (await checkPanelExists(guild)) {
    return true; // Panel already exists
  }
  
  // Panel doesn't exist, recreate it
  try {
    const { config } = require('../config');
    if (!config.WELCOME_CHANNEL_ID) return false;
    
    const channel = await guild.channels.fetch(config.WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return false;
    
    const { embed, components } = buildVerifyPanelEmbed();
    const message = await channel.send({ embeds: [embed], components });
    
    await storePanelMessage(guild.id, message.id, channel.id);
    await logEvent(
      guild,
      'Panel restored',
      'Verification panel was automatically recreated'
    );
    
    console.log(`Restored verification panel for guild ${guild.id}`);
    return true; // Successfully created panel
  } catch (err) {
    logError('panelRestore ensurePanelExists', err);
    return false; // Failed to create panel
  }
}

/**
 * Start panel monitoring and restoration
 */
async function startPanelMonitoring(client) {
  await loadPanelData();
  
  // Check all guilds on startup
  for (const guild of client.guilds.cache.values()) {
    await ensurePanelExists(guild);
  }
  
  // Set up periodic checks (every 5 minutes)
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await ensurePanelExists(guild);
    }
  }, 5 * 60 * 1000);
}

module.exports = {
  storePanelMessage,
  checkPanelExists,
  ensurePanelExists,
  startPanelMonitoring,
};
