// path: src/commands/security.js
//
// Admin security slash commands: /security status, lockdown, unlock.
// Requires Administrator permission.

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { config } = require('../config');
const { getQueueLength } = require('../security/joinQueue');
const { getVerificationSessionCount } = require('../verification/verificationService');
const { getCount: getUnverifiedCount } = require('../security/unverifiedRegistry');
const { isLockdownActive, activateLockdown, deactivateLockdown } = require('../security/autoLockdown');
const { logError } = require('../utils/logger');
const { sendVerifyPanel } = require('../verification/verificationService');
const { clearQueue } = require('../security/joinQueue');
const { isSafeModeActive } = require('../security/raidDetection');
const { getCaptchaGenerationRate } = require('../verification/captchaHandler');
const { getSuspiciousAccountCount } = require('../verification/verificationService');
const { getJoinRateLast10Seconds } = require('../security/raidDetection');

const COMMAND_NAME = 'security';

/** Build the /security slash command definition. */
function buildSecurityCommand() {
  return new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Security management commands (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sc) =>
      sc
        .setName('status')
        .setDescription('Show bot system stats'),
    )
    .addSubcommand((sc) =>
      sc.setName('lockdown').setDescription('Enable server lockdown')
        .addStringOption(option =>
          option.setName('action')
            .setDescription('Lockdown action')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' }
            )
        )
    )
    .addSubcommand((sc) =>
      sc.setName('verifypanel').setDescription('Recreate verification panel'),
    )
    .addSubcommand((sc) =>
      sc.setName('resetqueue').setDescription('Clear verification queue'),
    );
}

/** Handle /security status subcommand. */
async function handleStatus(interaction) {
  const mem = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const uptimeSec = Math.floor(process.uptime());
  const queueSize = getQueueLength();
  const sessionCount = getVerificationSessionCount();
  const unverifiedCount = typeof getUnverifiedCount === 'function' ? getUnverifiedCount() : 0;
  const lockdown = isLockdownActive();
  const safeMode = isSafeModeActive();
  const captchaRate = getCaptchaGenerationRate();
  const suspiciousCount = getSuspiciousAccountCount();
  const joinRate = getJoinRateLast10Seconds();

  // Determine overall health color
  let color = 0x2ecc71; // Green - healthy
  let status = '🟢 Healthy';
  
  if (safeMode || lockdown) {
    color = 0xe74c3c; // Red - danger
    status = '🔴 Danger';
  } else if (queueSize > 20 || sessionCount > 15 || parseFloat(heapMB) > 200) {
    color = 0xf39c12; // Yellow - high load
    status = '🟡 High Load';
  }

  const embed = new EmbedBuilder()
    .setTitle('Bot Health Status')
    .setDescription(status)
    .setColor(color)
    .addFields(
      { name: 'Verification Queue Size', value: String(queueSize), inline: true },
      { name: 'Active Captcha Sessions', value: String(sessionCount), inline: true },
      { name: 'Memory Usage (MB)', value: heapMB, inline: true },
      { name: 'Safe Mode Status', value: safeMode ? '🔒 Active' : '✅ Inactive', inline: true },
      { name: 'Lockdown Status', value: lockdown ? '🔒 Active' : '✅ Inactive', inline: true },
      { name: 'Captcha Generation Rate', value: `${captchaRate}/min`, inline: true },
      { name: 'Suspicious Accounts Detected', value: String(suspiciousCount), inline: true },
      { name: 'Join Rate (last 10 seconds)', value: String(joinRate), inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/** Handle /security lockdown subcommand. */
async function handleLockdown(interaction) {
  const action = interaction.options.getString('action');
  
  try {
    const guild = interaction.guild;
    
    if (action === 'on') {
      await activateLockdown(guild);
      await interaction.reply({
        content: '🔒 Lockdown activated.',
        ephemeral: true,
      });
    } else {
      deactivateLockdown();
      await interaction.reply({
        content: '✅ Lockdown deactivated.',
        ephemeral: true,
      });
    }
  } catch (err) {
    logError('security lockdown', err);
    await interaction.reply({
      content: 'Failed to toggle lockdown.',
      ephemeral: true,
    }).catch(() => {});
  }
}

/** Handle /security verifypanel subcommand. */
async function handleVerifyPanel(interaction) {
  try {
    const guild = interaction.guild;
    await sendVerifyPanel(guild);
    await interaction.reply({
      content: '✅ Verification panel recreated.',
      ephemeral: true,
    });
  } catch (err) {
    logError('security verifypanel', err);
    await interaction.reply({
      content: 'Failed to recreate verification panel.',
      ephemeral: true,
    }).catch(() => {});
  }
}

/** Handle /security resetqueue subcommand. */
async function handleResetQueue(interaction) {
  try {
    clearQueue();
    await interaction.reply({
      content: '✅ Verification queue cleared.',
      ephemeral: true,
    });
  } catch (err) {
    logError('security resetqueue', err);
    await interaction.reply({
      content: 'Failed to clear verification queue.',
      ephemeral: true,
    }).catch(() => {});
  }
}

/** Handle /security command. */
async function handleSecurityCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'status') {
    await handleStatus(interaction);
  } else if (subcommand === 'lockdown') {
    await handleLockdown(interaction);
  } else if (subcommand === 'verifypanel') {
    await handleVerifyPanel(interaction);
  } else if (subcommand === 'resetqueue') {
    await handleResetQueue(interaction);
  }
}

module.exports = {
  buildSecurityCommand,
  handleSecurityCommand,
  COMMAND_NAME,
};
