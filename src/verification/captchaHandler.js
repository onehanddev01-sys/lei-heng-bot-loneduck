//  คอมโพเนนต์ Discord.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
//  การสร้าง SVG captcha
const svgCaptcha = require('svg-captcha');
//  การประมวลผลภาพ
const sharp = require('sharp');
//  ค่า configuration
const { config } = require('../config');

//  การตั้งค่า captcha
const IMAGE_CAPTCHA_LENGTH = 6;
const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 100;

//  การติดตามการสร้าง captcha
let captchaGenerationCount = 0;
let captchaRateWindowStart = Date.now();

//  รีเซ็ตจำนวนการสร้าง captcha ทุกนาที
setInterval(() => {
  captchaGenerationCount = 0;
  captchaRateWindowStart = Date.now();
}, 60000);

//  ดึงอัตราการสร้าง captcha ต่อนาที
function getCaptchaGenerationRate() {
  const now = Date.now();
  const windowMs = now - captchaRateWindowStart;
  
  //  รีเซ็ตถ้าหน้าต่างหมดอายุ
  if (windowMs >= 60000) {
    captchaGenerationCount = 0;
    captchaRateWindowStart = now;
    return 0;
  }
  
  //  คำนวณอัตรา
  const rate = Math.round((captchaGenerationCount / windowMs) * 60000);
  return rate;
}

//  ติดตามการสร้าง captcha
function trackCaptchaGeneration() {
  captchaGenerationCount++;
}

//  สร้าง image captcha
async function generateImageCaptcha(harder = false) {
  trackCaptchaGeneration();
  //  ปรับความยาวสำหรับโหมดยากขึ้น
  const length = harder ? 8 : IMAGE_CAPTCHA_LENGTH;
  
  //  สร้าง SVG captcha
  const captcha = svgCaptcha.create({
    length: length,
    size: 6,
    noise: 2,
    color: true,
    background: '#ffffff'
  });
  
  //  แปลง SVG เป็น PNG
  const buffer = await sharp(Buffer.from(captcha.data))
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT)
    .png()
    .toBuffer();
  
  return { buffer, text: captcha.text };
}

//  สร้าง embed สำหรับ panel การยืนยันตัวตน
function buildVerifyPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(`ยินดีต้อนรับสู่ ${config.SERVER_NAME}`)
    .setDescription(
      'กดปุ่ม **ยืนยันตัวตน** ด้านล่างเพื่อเริ่มกระบวนการ Verify.\nระบบจะแสดงรูป Captcha ให้กรอกรหัส โดยไม่มีข้อความรบกวนในห้องนี้',
    )
    .setColor(0x00ae86);

  //  สร้างปุ่ม verify
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_start')
      .setLabel('ยืนยันตัวตน')
      .setStyle(ButtonStyle.Success),
  );

  return { embed, components: [row] };
}

//  สร้างการตอบกลับสำหรับรูป captcha
function buildCaptchaImageReply(buffer) {
  //  สร้าง attachment
  const attachment = new AttachmentBuilder(buffer, { name: 'captcha.png' });
  const embed = new EmbedBuilder()
    .setTitle('ยืนยันตัวตน - กรอกรหัส')
    .setDescription('กรอกรหัสตามที่เห็นในรูปด้านล่าง แล้วกดปุ่ม **กรอกรหัส** เพื่อส่งคำตอบ')
    .setImage('attachment://captcha.png')
    .setColor(0x00ae86);

  //  สร้างปุ่มกรอกรหัส
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_enter_code')
      .setLabel('กรอกรหัส')
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embeds: [embed],
    files: [attachment],
    components: [row],
    ephemeral: true,
  };
}

//  สร้าง modal สำหรับ captcha รูปภาพ
function buildCaptchaModalForImage() {
  const modal = new ModalBuilder()
    .setCustomId('verify_submit')
    .setTitle('กรอกรหัส Captcha');

  //  สร้าง text input
  const input = new TextInputBuilder()
    .setCustomId('captcha_code')
    .setLabel('กรอกรหัสตามที่เห็นในรูป (ตัวอักษรและตัวเลข)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(4)
    .setMaxLength(8);

  const row = new ActionRowBuilder().addComponents(input);
  modal.addComponents(row);

  return modal;
}

//  ตรวจสอบข้อมูล captcha
function validateCaptchaInput(rawInput, expectedCode) {
  //  ทำให้ข้อมูลเป็นมาตรฐาน
  const normalized = (rawInput || '').trim().toUpperCase();
  const expected = (expectedCode || '').toUpperCase();

  //  ตรวจสอบว่าข้อมูลมีแต่ตัวอักษรและตัวเลขเท่านั้น
  if (!/^[A-Z0-9]+$/i.test((rawInput || '').trim())) {
    return {
      valid: false,
      errorMessage: 'รหัสต้องเป็นตัวอักษรหรือตัวเลขเท่านั้น กรุณาลองใหม่อีกครั้ง.',
    };
  }
  //  ตรวจสอบว่าข้อมูลตรงกับรหัสที่คาดหวมหรือไม่
  if (normalized !== expected) {
    return { valid: false, normalizedInput: normalized };
  }
  //  ข้อมูลถูกต้อง
  return { valid: true, normalizedInput: normalized };
}

//  exports
module.exports = {
  generateImageCaptcha,
  buildVerifyPanelEmbed,
  buildCaptchaImageReply,
  buildCaptchaModalForImage,
  validateCaptchaInput,
  getCaptchaGenerationRate,
};
