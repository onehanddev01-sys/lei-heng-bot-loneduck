// path: src/commands/setup.js
//
// Setup command: allows admins to configure bot settings per guild.
// Stores configuration in JSON database for persistence.

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logError } = require('../utils/logger');
const { 
  getGuildConfig, 
  setGuildConfig, 
  validateChannelAccess,
  validateRoleAccess
} = require('../utils/guildConfig');

const COMMAND_NAME = 'setup';

/** Build the /setup slash command definition. */
function buildSetupCommand() {
  return new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Configure bot settings for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName('verification_channel')
        .setDescription('Set the verification channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel where verification panel will be sent')
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('log_channel')
        .setDescription('Set the security log channel')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Channel where security events will be logged')
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('quarantine_role')
        .setDescription('Set the quarantine role for suspicious users')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to assign to suspicious users')
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName('verified_role')
        .setDescription('Set the verified role for successful verification')
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to assign to verified users')
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName('status')
        .setDescription('Show current configuration')
    );
}

/** Handle /setup verification_channel subcommand. */
async function handleVerificationChannel(interaction) {
  try {
    const channel = interaction.options.getChannel('channel');
    const guild = interaction.guild;
    
    if (!await validateChannelAccess(guild, channel.id)) {
      await interaction.reply({
        content: '❌ Cannot access this channel. Please check bot permissions.',
        ephemeral: true
      });
      return;
    }
    
    await setGuildConfig(guild.id, { verification_channel: channel.id });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Verification channel set to ${channel}`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('setup verification_channel', err);
    await interaction.reply({
      content: '❌ Failed to set verification channel.',
      ephemeral: true
    });
  }
}

/** Handle /setup log_channel subcommand. */
async function handleLogChannel(interaction) {
  try {
    const channel = interaction.options.getChannel('channel');
    const guild = interaction.guild;
    
    if (!await validateChannelAccess(guild, channel.id)) {
      await interaction.reply({
        content: '❌ Cannot access this channel. Please check bot permissions.',
        ephemeral: true
      });
      return;
    }
    
    await setGuildConfig(guild.id, { log_channel: channel.id });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Security log channel set to ${channel}`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('setup log_channel', err);
    await interaction.reply({
      content: '❌ Failed to set log channel.',
      ephemeral: true
    });
  }
}

/** Handle /setup quarantine_role subcommand. */
async function handleQuarantineRole(interaction) {
  try {
    const role = interaction.options.getRole('role');
    const guild = interaction.guild;
    
    if (!await validateRoleAccess(guild, role.id)) {
      await interaction.reply({
        content: '❌ Cannot assign this role. Please check bot permissions.',
        ephemeral: true
      });
      return;
    }
    
    await setGuildConfig(guild.id, { quarantine_role: role.id });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Quarantine role set to ${role}`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('setup quarantine_role', err);
    await interaction.reply({
      content: '❌ Failed to set quarantine role.',
      ephemeral: true
    });
  }
}

/** Handle /setup verified_role subcommand. */
async function handleVerifiedRole(interaction) {
  try {
    const role = interaction.options.getRole('role');
    const guild = interaction.guild;
    
    if (!await validateRoleAccess(guild, role.id)) {
      await interaction.reply({
        content: '❌ Cannot assign this role. Please check bot permissions.',
        ephemeral: true
      });
      return;
    }
    
    await setGuildConfig(guild.id, { verified_role: role.id });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Configuration Updated')
      .setDescription(`Verified role set to ${role}`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('setup verified_role', err);
    await interaction.reply({
      content: '❌ Failed to set verified role.',
      ephemeral: true
    });
  }
}

/** Handle /setup status subcommand. */
async function handleStatus(interaction) {
  try {
    const guild = interaction.guild;
    const config = await getGuildConfig(guild.id);
    
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Current Configuration')
      .setColor(0x3498db)
      .addFields(
        {
          name: 'Verification Channel',
          value: config.verification_channel ? `<#${config.verification_channel}>` : '❌ Not set',
          inline: true
        },
        {
          name: 'Log Channel',
          value: config.log_channel ? `<#${config.log_channel}>` : '❌ Not set',
          inline: true
        },
        {
          name: 'Quarantine Role',
          value: config.quarantine_role ? `<@&${config.quarantine_role}>` : '❌ Not set',
          inline: true
        },
        {
          name: 'Verified Role',
          value: config.verified_role ? `<@&${config.verified_role}>` : '❌ Not set',
          inline: true
        }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('setup status', err);
    await interaction.reply({
      content: '❌ Failed to fetch configuration.',
      ephemeral: true
    });
  }
}

/** Handle /setup command. */
async function handleSetupCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'verification_channel') {
    await handleVerificationChannel(interaction);
  } else if (subcommand === 'log_channel') {
    await handleLogChannel(interaction);
  } else if (subcommand === 'quarantine_role') {
    await handleQuarantineRole(interaction);
  } else if (subcommand === 'verified_role') {
    await handleVerifiedRole(interaction);
  } else if (subcommand === 'status') {
    await handleStatus(interaction);
  }
}

module.exports = {
  buildSetupCommand,
  handleSetupCommand,
  COMMAND_NAME,
};
