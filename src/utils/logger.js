// path: src/utils/logger.js
//
// Logging utilities: write logs to a file and to the Discord log channel using embeds.

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { config } = require('../config');

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create logs directory:', err);
  }
}

ensureLogDir();

function writeToFile(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
}

function buildLogEmbed(type, description, color) {
  return new EmbedBuilder()
    .setTitle(type)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

async function logEvent(guild, type, description) {
  // Always write to file first - this should never fail bot
  try {
    writeToFile(type, description);
  } catch (fileErr) {
    console.error('Failed to write to log file:', fileErr);
  }

  if (!guild || !config.LOG_CHANNEL_ID) {
    return;
  }

  try {
    // Handle both real guild objects and fake guild objects (with just id)
    let channel;
    if (typeof guild.channels?.fetch === 'function') {
      // Real guild object
      channel = await guild.channels.fetch(config.LOG_CHANNEL_ID).catch(() => null);
    } else {
      // Fake guild object - we can't fetch channels without a real guild object
      // Try to get channel from cache
      channel = guild.client.channels.cache.get(config.LOG_CHANNEL_ID);
      if (!channel) {
        console.warn(`Cannot log to Discord channel: guild object missing channels.fetch method and channel not in cache`);
        return;
      }
    }
    
    if (!channel || !channel.isTextBased()) return;

    const colorByType = {
      'User joined': 0x3498db,
      'Captcha started': 0x3498db,
      'Captcha failed': 0xe67e22,
      'Captcha success': 0x2ecc71,
      'Verification success': 0x2ecc71,
      'Verification failed': 0xe67e22,
      'User kicked': 0xe74c3c,
      'Suspicious account': 0xf1c40f,
      'Suspicious bot-like account': 0xe67e22,
      'Raid detected': 0x9b59b6,
      'Raid protection enabled': 0xd35400,
      'Lockdown activated': 0xc0392b,
      'Captcha expired': 0x8e44ad,
      'Bot ready': 0x1abc9c,
    };

    const color = colorByType[type] || 0x95a5a6;
    const embed = buildLogEmbed(type, description, color);

    await channel.send({ embeds: [embed] });
  } catch (err) {
    // Logging should never crash the bot
    console.error('Failed to send log embed:', err);
  }
}

function logError(context, error) {
  const msg =
    error instanceof Error
      ? `${context}: ${error.stack || error.message}`
      : `${context}: ${String(error)}`;

  writeToFile('ERROR', msg);
  console.error(msg);
}

module.exports = {
  logEvent,
  logError,
};

