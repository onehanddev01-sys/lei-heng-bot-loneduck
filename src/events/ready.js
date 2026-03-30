// path: src/events/ready.js
//
// Runs once when the bot is ready: send verify panel, start workers, welcome cleanup,
// health monitor, memory guard, and slash command registration.

const { REST, Routes } = require('discord.js');
const { config } = require('../config');
const { logEvent, logError } = require('../utils/logger');
const { sendVerifyPanel } = require('../verification/verificationService');
const { startSweep } = require('../security/unverifiedRegistry');
const { startWorker } = require('../security/joinQueue');
const { startHealthMonitor } = require('../system/healthMonitor');
const { startMemoryGuard } = require('../system/memoryGuard');
const { startPanelMonitoring } = require('../verification/panelRestore');
const { buildSecurityCommand } = require('../commands/security');
const { buildSetupCommand } = require('../commands/setup');
const { buildConfigCommand } = require('../commands/config');
const { initializeStartupHealthCheck } = require('../system/startupHealthCheck');
const guildMemberAdd = require('./guildMemberAdd');

module.exports = async function onReady(client) {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    // Start background workers (non-blocking).
    startSweep(client);
    startWorker(guildMemberAdd.processMemberJoin);
    startHealthMonitor();
    startMemoryGuard();
    startPanelMonitoring(client);
    
    // Run startup health check
    await initializeStartupHealthCheck(client);
  } catch (err) {
    logError('ready: failed to start workers', err);
  }

  // Register slash commands.
  try {
    const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
    const commands = [
      buildSecurityCommand().toJSON(),
      buildSetupCommand().toJSON(),
      buildConfigCommand().toJSON()
    ];
    const route = config.GUILD_ID
      ? Routes.applicationGuildCommands(client.user.id, config.GUILD_ID)
      : Routes.applicationCommands(client.user.id);
    await rest.put(route, { body: commands });
  } catch (err) {
    logError('ready: failed to register slash commands', err);
  }

  if (config.GUILD_ID) {
    try {
      const guild = await client.guilds.fetch(config.GUILD_ID);
      await sendVerifyPanel(guild);
      await logEvent(
        guild,
        'Bot ready',
        `Verification panel initialized for ${config.SERVER_NAME}.`,
      );
    } catch (err) {
      logError('Failed to send initial verify panel', err);
    }
  }
};

