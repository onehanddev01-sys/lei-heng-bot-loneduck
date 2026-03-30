// path: index.js

require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { config, validateConfig } = require('./src/config');
const { logError } = require('./src/utils/logger');

const onReady = require('./src/events/ready');
const onGuildMemberAdd = require('./src/events/guildMemberAdd');
const onInteractionCreate = require('./src/events/interactionCreate');

const { initializeGracefulShutdown } = require('./src/system/gracefulShutdown');

validateConfig();

const client = new Client({

  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],

  partials: [Partials.Channel],

});

client.once('clientReady', async (readyClient) => {

  console.log(`Logged in as ${readyClient.user.tag}`);

  try {

    await onReady(readyClient);

  } catch (err) {

    logError('ready handler error', err);

  }

});

client.on('guildMemberAdd', async (member) => {

  try {

    await onGuildMemberAdd(member);

  } catch (err) {

    logError('guildMemberAdd handler error', err);

  }

});

client.on('interactionCreate', async (interaction) => {

  try {

    await onInteractionCreate(interaction);

  } catch (err) {

    logError('interactionCreate handler error', err);

  }

});

process.on('unhandledRejection', (reason) => {

  logError('Unhandled promise rejection', reason);

});

process.on('uncaughtException', (err) => {

  logError('Uncaught exception', err);

});

(async () => {

  try {

    await client.login(config.DISCORD_BOT_TOKEN);

    initializeGracefulShutdown(client);

  } catch (err) {

    logError('Failed to login to Discord', err);
    process.exit(1);

  }

})();