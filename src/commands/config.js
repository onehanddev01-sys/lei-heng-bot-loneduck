//  นำเข้า Discord.js  slash commands  permissions  embeds  
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
//  นำเข้า error logging  
const { logError } = require('../utils/logger');
//  นำเข้า guild configuration  
const { getGuildConfig, setGuildConfig } = require('../utils/guildConfig');

//   ค่าคงที่  ชื่อคำสั่ง  
const COMMAND_NAME = 'config';

//   ฟังก์ชัน  สร้างคำสั่ง config  slash command  
function buildConfigCommand() {
  return new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('แก้ไขการตั้งค่าบอท')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    //  คำสั่งย่อย  show subcommand  
    .addSubcommand((sc) =>
      sc
        .setName('show')
        .setDescription('แสดงการตั้งค่าปัจจุบัน')
    )
    //  คำสั่งย่อย  telegram subcommand
    .addSubcommand((sc) =>
      sc
        .setName('telegram')
        .setDescription('ตั้งค่าการแจ้งเตือน Telegram')
        .addStringOption(option =>
          option.setName('status')
            .setDescription('เปิดหรือปิดการแจ้งเตือน Telegram')
            .setRequired(true)
            .addChoices(
              { name: 'เปิดใช้งาน', value: 'enable' },
              { name: 'ปิดใช้งาน', value: 'disable' }
            )
        )
    )
    //  คำสั่งย่อย  raid threshold subcommand  
    .addSubcommand((sc) =>
      sc
        .setName('raid_threshold')
        .setDescription('ตั้งค่าเกณฑ์การตรวจจับ Raid')
        .addIntegerOption(option =>
          option.setName('threshold')
            .setDescription('จำนวนผู้เข้าร่วมที่จะทำให้เกิดการตรวจจับ Raid')
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(100)
        )
    )
    //  คำสั่งย่อย  account age subcommand  
    .addSubcommand((sc) =>
      sc
        .setName('account_age')
        .setDescription('ตั้งค่าอายุบัญชีขั้นต่ำ (วัน)')
        .addIntegerOption(option =>
          option.setName('days')
            .setDescription('อายุบัญชีขั้นต่ำเป็นวัน')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(365)
        )
    );
}

//  จัดการคำสั่งย่อย show  
async function handleShow(interaction) {
  try {
    const guild = interaction.guild;
    const config = await getGuildConfig(guild.id);
    
    const embed = new EmbedBuilder()
      .setTitle('⚙️ การตั้งค่าปัจจุบัน')
      .setColor(0x3498db)
      .addFields(
        { name: 'ช่องทางยืนยันตัวตน', value: config.verification_channel || 'ไม่ได้ตั้งค่า', inline: true },
        { name: 'ช่องทางบันทึกข้อมูล', value: config.log_channel || 'ไม่ได้ตั้งค่า', inline: true },
        { name: 'บทบาทกักกัน', value: config.quarantine_role || 'ไม่ได้ตั้งค่า', inline: true },
        { name: 'บทบาทยืนยันตัวตน', value: config.verified_role || 'ไม่ได้ตั้งค่า', inline: true },
        { name: 'การแจ้งเตือน Telegram', value: config.telegram_enabled ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน', inline: true },
        { name: 'เกณฑ์ Raid', value: config.raid_threshold || '15 คนเข้า', inline: true },
        { name: 'ขีดจำกัดอายุบัญชี', value: config.account_age_days || '7 วัน', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `เซิร์ฟเวอร์ ID: ${guild.id}` });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config show', err);
    await interaction.reply({
      content: '❌ ไม่สามารถแสดงการตั้งค่าได้.',
      ephemeral: true
    });
  }
}

//  จัดการคำสั่งย่อย telegram  
async function handleTelegram(interaction) {
  try {
    const status = interaction.options.getString('status');
    const guild = interaction.guild;
    
    await setGuildConfig(guild.id, { 
      telegram_enabled: status === 'enable' 
    });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ การตั้งค่าได้รับการอัพเดท')
      .setDescription(`การแจ้งเตือน Telegram ${status === 'enable' ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว'}`)
      .setColor(status === 'enable' ? 0x2ecc71 : 0xe74c3c)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config telegram', err);
    await interaction.reply({
      content: '❌ ไม่สามารถอัพเดทการตั้งค่า Telegram ได้.',
      ephemeral: true
    });
  }
}

//  จัดการคำสั่งย่อย raid threshold  
async function handleRaidThreshold(interaction) {
  try {
    const threshold = interaction.options.getInteger('threshold');
    const guild = interaction.guild;
    
    await setGuildConfig(guild.id, { raid_threshold: threshold });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ การตั้งค่าได้รับการอัพเดท')
      .setDescription(`ตั้งค่าเกณฑ์การตรวจจับ Raid เป็น ${threshold} คนเข้า`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config raid_threshold', err);
    await interaction.reply({
      content: '❌ ไม่สามารถอัพเดทเกณฑ์ Raid ได้.',
      ephemeral: true
    });
  }
}

//  จัดการคำสั่งย่อย account age  
async function handleAccountAge(interaction) {
  try {
    const days = interaction.options.getInteger('days');
    const guild = interaction.guild;
    
    await setGuildConfig(guild.id, { account_age_days: days });
    
    const embed = new EmbedBuilder()
      .setTitle('✅ การตั้งค่าได้รับการอัพเดท')
      .setDescription(`ตั้งค่าอายุบัญชีขั้นต่ำเป็น ${days} วัน`)
      .setColor(0x2ecc71)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logError('config account_age', err);
    await interaction.reply({
      content: '❌ ไม่สามารถอัพเดทการตั้งค่าอายุบัญชีได้.',
      ephemeral: true
    });
  }
}

//  จัดการคำสั่งหลัก config  
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
        content: '❌ ไม่พบคำสั่งย่อนี้.',
        ephemeral: true
      });
  }
}

//  ส่งออก  
module.exports = {
  buildConfigCommand,
  handleConfigCommand,
  COMMAND_NAME
};
