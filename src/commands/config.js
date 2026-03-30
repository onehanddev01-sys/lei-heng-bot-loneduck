// path: src/commands/config.js
//
// Config command: allows admins to modify bot settings dynamically.
// Updates configuration in real-time without restarting the bot.

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logError } = require('../utils/logger');
const { getGuildConfig, setGuildConfig } = require('../utils/guildConfig');

const COMMAND_NAME = 'config';

/** Build the /config slash command definition. */
function buildConfigCommand() {
  return new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Modify bot configuration settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName('show')
        .setDescription('Show current configuration')
    )
    .addSubcommand((sc) =>
      sc
        .setName('telegram')
        .setDescription('Configure Telegram alerts')
        .addStringOption(option =>
          option.setName('status')
            .setDescription('Enable or disable Telegram alerts')
            .setRequired(true)
            .addChoices(
              { name: 'Enable', value: 'enable' },
              { name: 'Disable', value: 'disable' }
            )
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('raid_threshold')
        .setDescription('Set raid detection threshold')
        .addIntegerOption(option =>
          option.setName('threshold')
            .setDescription('Number of joins to trigger raid detection')
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(100)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('account_age')
        .setDescription('Set minimum account age requirement (days)')
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('Minimum account age in days')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(365)
        )
    );
}

/** Handle /config show subcommand. */
async function handleShow(interaction) {
  try {
    const guild = interaction.guild;
    const config = await getGuildConfig(guild.id);
    
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Current Configuration')
      .setColor(0x3498db)
      .addFields(
        { name: 'Verification Channel', value: config.verification_channel || 'Not set', inline: true },
        { name: 'Log Channel', value: config.log_channel || 'Not set', inline: true },
        { name: 'Quarantine Role', value: config.quarantine_role || 'Not set', inline: true },
        { name: 'Verified Role', value: config.verified_role || 'Not set', inline: true },
        { name: 'Telegram Alerts', value: config.telegram_enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Raid Threshold', value: config.raid_threshold || '15 joins', inline: true },
        { name: 'Account Age Limit', value: config.account_age_days || '7 days', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Guild ID: ${guild.id}` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config show', err);
    await interaction.reply({
      content: '❌ Failed to show configuration.',
      ephemeral: true
    });
  }
}

/** Handle /config telegram subcommand. */
async function handleTelegram(interaction) {
  try {
    const status = interaction.options.getString('status');
    const guild = interaction.guild;
    
    await setGuildConfig(guild.id, { 
      telegram_enabled: status === 'enable' 
    });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Telegram alerts ${status === 'enable' ? 'enabled' : 'disabled'}`)
      .setColor(status === 'enable' ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config telegram', err);
    await interaction.reply({
      content: '❌ Failed to update Telegram settings.',
      ephemeral: true
    });
  }
}

/** Handle /config raid_threshold subcommand. */
async function handleRaidThreshold(interaction) {
  try {
    const threshold = interaction.options.getInteger('threshold');
    const guild = interaction.guild;
    
    await setGuildConfig(guild.id, { raid_threshold: threshold });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Raid detection threshold set to ${threshold} joins`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config raid_threshold', err);
    await interaction.reply({
      content: '❌ Failed to update raid threshold.',
      ephemeral: true
    });
  }
}

/** Handle /config account_age subcommand. */
async function handleAccountAge(interaction) {
  try {
    const days = interaction.options.getInteger('days');
    const guild = interaction.guild;
    
    await setGuildConfig(guild.id, { account_age_days: days });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Minimum account age set to ${days} days`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config account_age', err);
    await interaction.reply({
      content: '❌ Failed to update account age setting.',
      ephemeral: true
    });
  }
}

/** Main handler for /config command. */
async function handleConfigCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  
  switch (subcommand) {
    case 'show':
      await handleShow(interaction);
      break;
    case 'telegram':
      await handleTelegram(interaction);
      break;
    case 'raid_threshold':
      await handleRaidThreshold(interaction);
      break;
    case 'account_age':
      await handleAccountAge(interaction);
      break;
    default:
      await interaction.reply({
        content: '❌ Unknown subcommand.',
        ephemeral: true
      });
  }
}

module.exports = {
  buildConfigCommand,
  handleConfigCommand,
  COMMAND_NAME
};
