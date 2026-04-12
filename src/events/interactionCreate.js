
//  บริการการยืนยันตัวตน  
const {
  startVerification,
  handleEnterCodeButton,
  handleVerificationSubmit,
} = require('../verification/verificationService');
//  security command  
const { handleSecurityCommand, COMMAND_NAME } = require('../commands/security');
//  setup command  
const { handleSetupCommand, COMMAND_NAME: SETUP_COMMAND_NAME } = require('../commands/setup');
//  config command  
const { handleConfigCommand, COMMAND_NAME: CONFIG_COMMAND_NAME } = require('../commands/config');
//  การบันทึกข้อผิดพลาด  
const { logError } = require('../utils/logger');

//  ตัวจัดการเหตุการณ์ interaction create  
module.exports = async function handleInteractionCreate(interaction) {
  try {
    //  คำสั่งความปลอดภัย  
    if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'Requires Manage Guild permission.', ephemeral: true });
        return;
      }
      await handleSecurityCommand(interaction);
      return;
    }

    //  คำสั่งการตั้งค่า  
    if (interaction.isChatInputCommand() && interaction.commandName === SETUP_COMMAND_NAME) {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'Requires Manage Guild permission.', ephemeral: true });
        return;
      }
      await handleSetupCommand(interaction);
      return;
    }

    //  คำสั่งค่ากำหนด  
    if (interaction.isChatInputCommand() && interaction.commandName === CONFIG_COMMAND_NAME) {
      if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'Requires Manage Guild permission.', ephemeral: true });
        return;
      }
      await handleConfigCommand(interaction);
      return;
    }

    //  ปุ่มการยืนยันตัวตน  
    if (interaction.isButton() && interaction.customId === 'verify_start') {
      await startVerification(interaction);
      return;
    }

    //  ปุ่มกรอกรหัส  
    if (interaction.isButton() && interaction.customId === 'verify_enter_code') {
      await handleEnterCodeButton(interaction);
      return;
    }

    //  การส่ง modal การยืนยันตัวตน  
    if (interaction.isModalSubmit() && interaction.customId === 'verify_submit') {
      await handleVerificationSubmit(interaction);
    }
  } catch (err) {
    logError('interactionCreate handler', err);
    try {
      //  ตอบกลับข้อผิดพลาด  ข้อความภาษาไทย  
      if (interaction.replied || interaction.deferred) return;
      await interaction.reply({
        content: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง.',
        ephemeral: true,
      }).catch(() => {});
    } catch (_) {}
  }
};

