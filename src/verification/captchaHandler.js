// path: src/verification/captchaHandler.js
//
// Captcha UI and validation: image-based captcha generation, modal, validation.
// Uses svg-captcha for image generation and sharp for SVG to PNG conversion. No session state; verificationService owns state.
//
// SCALING: Captcha generation is CPU-bound. For high load, consider a dedicated
// worker pool or external captcha service (e.g. hCaptcha) to offload from main process.

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
const svgCaptcha = require('svg-captcha');
const sharp = require('sharp');
const { config } = require('../config');

/** Length of captcha code: 5–6 alphanumeric characters. */
const IMAGE_CAPTCHA_LENGTH = 6;
const IMAGE_WIDTH = 300;
const IMAGE_HEIGHT = 100;

// Captcha generation rate tracking
let captchaGenerationCount = 0;
let captchaRateWindowStart = Date.now();

// Reset interval to prevent memory leaks
setInterval(() => {
  captchaGenerationCount = 0;
  captchaRateWindowStart = Date.now();
}, 60000); // Reset every 60 seconds

/**
 * Get captcha generation rate (per minute)
 */
function getCaptchaGenerationRate() {
  const now = Date.now();
  const windowMs = now - captchaRateWindowStart;
  
  if (windowMs >= 60000) {
    captchaGenerationCount = 0;
    captchaRateWindowStart = now;
    return 0;
  }
  
  const rate = Math.round((captchaGenerationCount / windowMs) * 60000);
  return rate;
}

/**
 * Track captcha generation
 */
function trackCaptchaGeneration() {
  captchaGenerationCount++;
}

/**
 * Generate an image-based captcha (non-blocking).
 * Uses svg-captcha and sharp to avoid native dependencies.
 * @param {boolean} [harder] - If true, use longer captcha (e.g. during lockdown).
 * @returns {Promise<{ buffer: Buffer, text: string }>}
 */
async function generateImageCaptcha(harder = false) {
  trackCaptchaGeneration();
  const length = harder ? 8 : IMAGE_CAPTCHA_LENGTH;
  
  // Generate SVG captcha
  const captcha = svgCaptcha.create({
    length: length,
    size: 6,
    noise: 2,
    color: true,
    background: '#ffffff'
  });
  
  // Convert SVG to PNG buffer using sharp
  const buffer = await sharp(Buffer.from(captcha.data))
    .resize(IMAGE_WIDTH, IMAGE_HEIGHT)
    .png()
    .toBuffer();
  
  return { buffer, text: captcha.text };
}

/**
 * Build the verify panel embed + button for #welcome (discord.js v14).
 */
function buildVerifyPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(`ยินดีต้อนรับสู่ ${config.SERVER_NAME}`)
    .setDescription(
      'กดปุ่ม **ยืนยันตัวตน** ด้านล่างเพื่อเริ่มกระบวนการ Verify.\nระบบจะแสดงรูป Captcha ให้กรอกรหัส โดยไม่มีข้อความรบกวนในห้องนี้',
    )
    .setColor(0x00ae86);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_start')
      .setLabel('ยืนยันตัวตน')
      .setStyle(ButtonStyle.Success),
  );

  return { embed, components: [row] };
}

/**
 * Build ephemeral reply payload with captcha image + "Enter code" button.
 * Used when user clicks Verify: show image, then they click button to open modal.
 * @param {Buffer} buffer - PNG buffer from generateImageCaptcha
 * @returns {{ embeds: EmbedBuilder[], files: AttachmentBuilder[], components: ActionRowBuilder[] }}
 */
function buildCaptchaImageReply(buffer) {
  const attachment = new AttachmentBuilder(buffer, { name: 'captcha.png' });
  const embed = new EmbedBuilder()
    .setTitle('ยืนยันตัวตน - กรอกรหัส')
    .setDescription('กรอกรหัสตามที่เห็นในรูปด้านล่าง แล้วกดปุ่ม **กรอกรหัส** เพื่อส่งคำตอบ')
    .setImage('attachment://captcha.png')
    .setColor(0x00ae86);

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

/**
 * Build modal for entering the captcha code (image-based flow).
 * User sees the image first, then opens this modal to type the code.
 */
function buildCaptchaModalForImage() {
  const modal = new ModalBuilder()
    .setCustomId('verify_submit')
    .setTitle('กรอกรหัส Captcha');

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

/**
 * Validate user input against expected captcha code.
 * Case-insensitive for alphanumeric codes.
 * @returns {{ valid: boolean, normalizedInput?: string, errorMessage?: string }}
 */
function validateCaptchaInput(rawInput, expectedCode) {
  const normalized = (rawInput || '').trim().toUpperCase();
  const expected = (expectedCode || '').toUpperCase();

  if (!/^[A-Z0-9]+$/i.test((rawInput || '').trim())) {
    return {
      valid: false,
      errorMessage: 'รหัสต้องเป็นตัวอักษรหรือตัวเลขเท่านั้น กรุณาลองใหม่อีกครั้ง.',
    };
  }
  if (normalized !== expected) {
    return { valid: false, normalizedInput: normalized };
  }
  return { valid: true, normalizedInput: normalized };
}

module.exports = {
  generateImageCaptcha,
  buildVerifyPanelEmbed,
  buildCaptchaImageReply,
  buildCaptchaModalForImage,
  validateCaptchaInput,
  getCaptchaGenerationRate,
};
