
//  Discord.js คำสั่ง slash สิทธิ์ embeds
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
//  ค่า configuration
const { config } = require('../config');
//  โมดูลความปลอดภัย คิวการเข้าร่วม การยืนยันตัวตน lockdown
const { getQueueLength } = require('../security/joinQueue');
const { getVerificationSessionCount } = require('../verification/verificationService');
const { getCount: getUnverifiedCount } = require('../security/unverifiedRegistry');
const { isLockdownActive, activateLockdown, deactivateLockdown } = require('../security/autoLockdown');
//  การบันทึก log
const { logError } = require('../utils/logger');
//  panel การยืนยันตัวตน
const { sendVerifyPanel } = require('../verification/verificationService');
//  การจัดการคิว
const { clearQueue } = require('../security/joinQueue');
//  การตรวจจับ raid  safe mode
const { isSafeModeActive } = require('../security/raidDetection');
//  การสร้าง captcha
const { getCaptchaGenerationRate } = require('../verification/captchaHandler');
//  บัญชีที่น่าสงสัย
const { getSuspiciousAccountCount } = require('../verification/verificationService');
//  การตรวจสอบอัตราการเข้าร่วม
const { getJoinRateLast10Seconds } = require('../security/raidDetection');

//  ชื่อคำสั่ง
const COMMAND_NAME = 'security';

//  สร้างคำสั่งความปลอดภัย slash command
function buildSecurityCommand() {
  return new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('คำสั่งจัดการความปลอดภัย (เฉพาะผู้ดูแลเท่านั้น)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    //  คำสั่งย่อย status
    .addSubcommand((sc) =>
      sc
        .setName('status')
        .setDescription('แสดงข้อมูลระบบ'),
    )
    //  คำสั่งย่อย lockdown
    .addSubcommand((sc) =>
      sc.setName('lockdown').setDescription('เปิดใช้งานการล็อคดาวน์')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('การกระทำล็อคดาวน์')
            .setRequired(true)
            .addChoices(
              { name: 'เปิดใช้งาน', value: 'on' },
              { name: 'ปิดใช้งาน', value: 'off' }
            )
        )
    )
    //  คำสั่งย่อย verify panel
    .addSubcommand((sc) =>
      sc.setName('verifypanel').setDescription('สร้างแพนอลการยืนยันตัวตนใหม่'),
    )
    //  คำสั่งย่อย reset queue
    .addSubcommand((sc) =>
      sc.setName('resetqueue').setDescription('ล้างคิวการยืนยันตัวตน'),
    );
}

//  จัดการคำสั่งย่อย status
async function handleStatus(interaction) {
  //  ตัวชี้วัดระบบ
  const mem = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const uptimeSec = Math.floor(process.uptime());
  //  ตัวชี้วัดความปลอดภัย
  const queueSize = getQueueLength();
  const sessionCount = getVerificationSessionCount();
  const unverifiedCount = typeof getUnverifiedCount === 'function' ? getUnverifiedCount() : 0;
  const lockdownActive = isLockdownActive();
  const safeModeActive = isSafeModeActive();
  const captchaRate = getCaptchaGenerationRate();
  const suspiciousCount = getSuspiciousAccountCount();
  const joinRate = getJoinRateLast10Seconds();

  //  สีสถานะ สุขภาพ
  let color = 0x2ecc71;
  let status = '🟢 Healthy';
  
  if (heapMB > 100 || queueSize > 50) {
    color = 0xe67e22;
    status = '🟡 High Load';
  }

  //  embed สถานะ
  const embed = new EmbedBuilder()
    .setTitle('สถานะระบบ')
    .setDescription(status)
    .setColor(color)
    .addFields(
      { name: 'การใช้หน่วยความจำ', value: `${heapMB} MB`, inline: true },
      { name: 'ขนาดคิว', value: queueSize.toString(), inline: true },
      { name: 'เซสชันการยืนยันตัวตน', value: sessionCount.toString(), inline: true },
      { name: 'ผู้ใช้ที่ยังไม่ได้ยืนยันตัวตน', value: unverifiedCount.toString(), inline: true },
      { name: 'การล็อคดาวน์', value: lockdownActive ? '🔒 เปิดใช้งาน' : '🔓 ปิดใช้งาน', inline: true },
      { name: 'โหมดปลอดภัย', value: safeModeActive ? '� เปิดใช้งาน' : '✅ ปิดใช้งาน', inline: true },
      { name: 'อัตราการสร้างแคปต์ชา', value: `${captchaRate}/min`, inline: true },
      { name: 'บัญชีที่น่าสงสัย', value: suspiciousCount.toString(), inline: true },
      { name: 'อัตราการเข้าร่วม (10 วินาที)', value: joinRate.toString(), inline: true },
      { name: 'เวลาทำงาน', value: `${uptimeSec}s`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

//  จัดการคำสั่งย่อย lockdown
async function handleLockdown(interaction) {
  const action = interaction.options.getString('action');
  
  try {
    if (action === 'on') {
      await activateLockdown(interaction.guild);
      await interaction.reply({
        content: '🔒 การล็อคดาวน์ได้ถูกเปิดใช้งานแล้ว',
        ephemeral: true,
      });
    } else {
      await deactivateLockdown(interaction.guild);
      await interaction.reply({
        content: '🔓 การล็อคดาวน์ได้ถูกปิดใช้งานแล้ว',
        ephemeral: true,
      });
    }
  } catch (err) {
    logError('handleLockdown', err);
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการเปิด/ปิดการล็อคดาวน์',
      ephemeral: true,
    });
  }
}

//  จัดการคำสั่งย่อย verify panel
async function handleVerifyPanel(interaction) {
  try {
    const guild = interaction.guild;
    await sendVerifyPanel(guild);
    await interaction.reply({
      content: '✅ แพนอลการยืนยันตัวตนได้ถูกสร้างขึ้นใหม่แล้ว',
      ephemeral: true,
    });
  } catch (err) {
    logError('handleVerifyPanel', err);
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการสร้างแพนอลการยืนยันตัวตน',
      ephemeral: true,
    });
  }
}

//  จัดการคำสั่งย่อย reset queue
async function handleResetQueue(interaction) {
  try {
    clearQueue();
    await interaction.reply({
      content: '✅ คิวการยืนยันตัวตนได้ถูกล้างแล้ว',
      ephemeral: true,
    });
  } catch (err) {
    logError('handleResetQueue', err);
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการล้างคิวการยืนยันตัวตน',
      ephemeral: true,
    });
  }
}

//  handler คำสั่งความปลอดภัยหลัก
async function handleSecurityCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'status':
        await handleStatus(interaction);
        break;
      case 'lockdown':
        await handleLockdown(interaction);
        break;
      case 'verifypanel':
        await handleVerifyPanel(interaction);
        break;
      case 'resetqueue':
        await handleResetQueue(interaction);
        break;
      default:
        await interaction.reply({
          content: 'คำสั่งย่อยไม่รู้จัก',
          ephemeral: true,
        });
    }
  } catch (err) {
    logError('handleSecurityCommand', err);
    await interaction.reply({
      content: 'เกิดข้อผิดพลาดในการประมวลผลคำสั่ง',
      ephemeral: true,
    });
  }
}

//  exports
module.exports = {
  buildSecurityCommand,
  handleSecurityCommand,
  COMMAND_NAME,
};
