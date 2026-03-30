// path: src/config.js
//
// Centralized configuration loaded from environment variables.

function getEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value;
}

const config = {
  DISCORD_BOT_TOKEN: getEnv('DISCORD_BOT_TOKEN'),
  SERVER_NAME: getEnv('SERVER_NAME', 'LoneDuck'),
  GUILD_ID: getEnv('GUILD_ID'),
  VERIFY_ROLE_ID: getEnv('VERIFY_ROLE_ID'),
  WELCOME_CHANNEL_ID: getEnv('WELCOME_CHANNEL_ID'),
  LOG_CHANNEL_ID: getEnv('LOG_CHANNEL_ID'),
  QUARANTINE_ROLE_ID: getEnv('QUARANTINE_ROLE_ID'),
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: getEnv('TELEGRAM_CHAT_ID'),
};

function validateConfig() {
  if (!config.DISCORD_BOT_TOKEN) {
    console.error('ERROR: Missing DISCORD_BOT_TOKEN in environment variables. Bot will exit.');
    console.log('Please set DISCORD_BOT_TOKEN in Railway Dashboard → Project → Variables');
    process.exit(1);
  }
}

module.exports = {
  config,
  validateConfig,
};

