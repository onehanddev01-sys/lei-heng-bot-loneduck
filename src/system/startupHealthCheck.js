
//  นำเข้า modules ที่จำเป็น
const { logError } = require('../utils/logger');
const { activateSafeMode } = require('../security/autoLockdown');

//  ทดสอบตัวสร้าง captcha
async function testCaptchaGenerator() {
  try {
    const { generateImageCaptcha } = require('../verification/captchaHandler');
    const result = await generateImageCaptcha();
    //  ตรวจสอบว่าสร้าง captcha ได้ถูกต้อง
    return result && result.buffer && result.text && result.text.length > 0;
  } catch (err) {
    logError('startupHealthCheck captcha generator test', err);
    return false;
  }
}

//  ทดสอบระบบคิว verification
async function testVerificationQueue() {
  try {
    const { getQueueLength, clearQueue } = require('../security/joinQueue');
    const initialLength = getQueueLength();

    //  ตรวจสอบว่าฟังก์ชันทำงานได้
    if (typeof getQueueLength !== 'function') return false;

    const length = getQueueLength();
    //  ตรวจสอบว่าคืนค่าเป็นตัวเลข
    return typeof length === 'number';
  } catch (err) {
    logError('startupHealthCheck verification queue test', err);
    return false;
  }
}

//  ทดสอบระบบ logging
async function testLoggingSystem() {
  try {
    const { logGenericEvent } = require('../utils/loggingService');

    //  สร้าง mock guild สำหรับทดสอบ
    const mockGuild = {
      id: 'test-guild',
      name: 'Test Guild',
      client: { user: { tag: 'test-bot' } }
    };

    await logGenericEvent(mockGuild, 'Health Check Test', 'Startup health check in progress');
    return true;
  } catch (err) {
    logError('startupHealthCheck logging system test', err);
    return false;
  }
}

//  ทดสอบระบบ guild config
async function testGuildConfig() {
  try {
    const { getGuildConfig, setGuildConfig, deleteGuildConfig } = require('../utils/guildConfig');

    //  ทดสอบการอ่าน config
    const testConfig = await getGuildConfig('test-guild');
    if (!testConfig || typeof testConfig !== 'object') return false;

    //  ทดสอบการเขียน config
    await setGuildConfig('test-guild', { test_field: 'test_value' });
    const updatedConfig = await getGuildConfig('test-guild');

    //  ตรวจสอบว่าเขียนได้ถูกต้อง
    const success = updatedConfig && updatedConfig.test_field === 'test_value';
    
    //  ลบข้อมูลทดสอบ
    await deleteGuildConfig('test-guild');
    
    return success;
  } catch (err) {
    logError('startupHealthCheck guild config test', err);
    return false;
  }
}

//  ทดสอบการเชื่อมต่อ Discord
async function testDiscordConnectivity(client) {
  try {
    //  ตรวจสอบว่า client พร้อมใช้งาน
    if (!client || !client.isReady()) return false;

    //  ทดสอบการดึงข้อมูลผู้ใช้
    await client.user.fetch();
    
    //  ตรวจสอบว่ามี guild
    const guild = client.guilds.cache.first();
    if (!guild) return false;

    return true;
  } catch (err) {
    logError('startupHealthCheck discord connectivity test', err);
    return false;
  }
}

//  ดำเนินการตรวจสอบสุขภาพระบบตอนเริ่มต้น
async function performStartupHealthCheck(client) {
  console.log('🏥 Starting startup health check...');

  //  เก็บผลการทดสอบ
  const results = {
    captchaGenerator: false,
    verificationQueue: false,
    loggingSystem: false,
    guildConfig: false,
    discordConnectivity: false,
    overall: false
  };

  //  รายการการทดสอบ
  const tests = [
    { name: 'captchaGenerator', test: () => testCaptchaGenerator() },
    { name: 'verificationQueue', test: () => testVerificationQueue() },
    { name: 'loggingSystem', test: () => testLoggingSystem() },
    { name: 'guildConfig', test: () => testGuildConfig() },
    { name: 'discordConnectivity', test: () => testDiscordConnectivity(client) }
  ];

  let passedTests = 0;

  //  ทำการทดสอบแต่ละรายการ
  for (const { name, test } of tests) {
    try {
      console.log(`  Testing ${name}...`);
      results[name] = await test();
      if (results[name]) {
        passedTests++;
        console.log(`  ✅ ${name} passed`);
      } else {
        console.log(`  ❌ ${name} failed`);
      }
    } catch (err) {
      console.log(`  ❌ ${name} failed with error`);
      logError(`startupHealthCheck ${name} error`, err);
    }
  }

  //  ตรวจสอบว่าผ่านทั้งหมดหรือไม่
  results.overall = passedTests === tests.length;

  if (results.overall) {
    console.log('✅ All startup health checks passed');
  } else {
    console.log(`⚠️ Startup health check: ${passedTests}/${tests.length} tests passed`);

    //  ตรวจสอบระบบที่สำคัญที่ล้มเหลว
    const criticalFailures = ['captchaGenerator', 'verificationQueue', 'discordConnectivity']
      .filter(system => !results[system]);

    //  ถ้ามีระบบสำคัญล้มเหลว ให้เปิด safe mode
    if (criticalFailures.length > 0) {
      console.log(`🚨 Critical systems failed: ${criticalFailures.join(', ')}. Enabling SAFE MODE`);
      try {
        await activateSafeMode(client.guilds.cache.first());
        console.log('🛡️ SAFE MODE activated due to startup failures');
      } catch (err) {
        logError('startupHealthCheck safe mode activation', err);
      }
    }
  }

  return results;
}

//  เริ่มต้นการตรวจสอบสุขภาพระบบ
async function initializeStartupHealthCheck(client) {
  //  รอ 2 วินาทีก่อนทำการทดสอบ
  await new Promise(resolve => setTimeout(resolve, 2000));

  return await performStartupHealthCheck(client);
}

//  exports
module.exports = {
  performStartupHealthCheck,
  initializeStartupHealthCheck,
};
