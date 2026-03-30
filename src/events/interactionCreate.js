// path: src/events/interactionCreate.js
//
// Routes button and modal interactions to the verification service and slash commands.

const {
  startVerification,
  handleEnterCodeButton,
  handleVerificationSubmit,
} = require('../verification/verificationService');
const { handleSecurityCommand, COMMAND_NAME } = require('../commands/security');
const { handleSetupCommand, COMMAND_NAME: SETUP_COMMAND_NAME } = require('../commands/setup');
const { handleConfigCommand, COMMAND_NAME: CONFIG_COMMAND_NAME } = require('../commands/config');
const { logError } = require('../utils/logger');

module.exports = async function handleInteractionCreate(interaction) {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'Requires Manage Guild permission.', ephemeral: true });
        return;
      }
      await handleSecurityCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === SETUP_COMMAND_NAME) {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'Requires Manage Guild permission.', ephemeral: true });
        return;
      }
      await handleSetupCommand(interaction);
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === CONFIG_COMMAND_NAME) {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'Requires Manage Guild permission.', ephemeral: true });
        return;
      }
      await handleConfigCommand(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'verify_start') {
      await startVerification(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'verify_enter_code') {
      await handleEnterCodeButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'verify_submit') {
      await handleVerificationSubmit(interaction);
    }
  } catch (err) {
    logError('interactionCreate handler', err);
    try {
      if (interaction.replied || interaction.deferred) return;
      await interaction.reply({
        content: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง.',
        ephemeral: true,
      }).catch(() => {});
    } catch (_) {}
  }
};

