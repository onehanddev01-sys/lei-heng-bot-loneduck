// path: src/system/startupHealthCheck.js
//
// Bot startup health check: validates critical systems on startup.
// If any system fails, logs error and enables SAFE MODE.

const { logError } = require('../utils/logger');
const { activateSafeMode } = require('../security/autoLockdown');

/**
 * Test captcha generator functionality
 * @returns {Promise<boolean>} True if captcha generator works
 */
async function testCaptchaGenerator() {
  try {
    const { generateImageCaptcha } = require('../verification/captchaHandler');
    const result = await generateImageCaptcha();
    return result && result.buffer && result.text && result.text.length > 0;
  } catch (err) {
    logError('startupHealthCheck captcha generator test', err);
    return false;
  }
}

/**
 * Test verification queue system
 * @returns {Promise<boolean>} True if verification queue works
 */
async function testVerificationQueue() {
  try {
    const { getQueueLength, clearQueue } = require('../security/joinQueue');
    const initialLength = getQueueLength();

    // Queue should be accessible
    if (typeof getQueueLength !== 'function') return false;

    // Test queue operations
    const length = getQueueLength();
    return typeof length === 'number';
  } catch (err) {
    logError('startupHealthCheck verification queue test', err);
    return false;
  }
}

/**
 * Test logging system
 * @returns {Promise<boolean>} True if logging system works
 */
async function testLoggingSystem() {
  try {
    const { logGenericEvent } = require('../utils/loggingService');

    // Test logging with a mock guild object
    const mockGuild = {
      id: 'test-guild',
      name: 'Test Guild',
      client: { user: { tag: 'test-bot' } }
    };

    // Try to log a test event (this may fail if no log channel is configured)
    await logGenericEvent(mockGuild, 'Health Check Test', 'Startup health check in progress');
    return true;
  } catch (err) {
    logError('startupHealthCheck logging system test', err);
    return false;
  }
}

/**
 * Test guild configuration system
 * @returns {Promise<boolean>} True if guild config works
 */
async function testGuildConfig() {
  try {
    const { getGuildConfig, setGuildConfig, deleteGuildConfig } = require('../utils/guildConfig');

    // Test configuration operations
    const testConfig = await getGuildConfig('test-guild');
    if (!testConfig || typeof testConfig !== 'object') return false;

    // Test setting configuration
    await setGuildConfig('test-guild', { test_field: 'test_value' });
    const updatedConfig = await getGuildConfig('test-guild');

    const success = updatedConfig && updatedConfig.test_field === 'test_value';
    
    // Clean up test data
    await deleteGuildConfig('test-guild');
    
    return success;
  } catch (err) {
    logError('startupHealthCheck guild config test', err);
    return false;
  }
}

/**
 * Test Discord API connectivity
 * @param {Client} client - Discord client
 * @returns {Promise<boolean>} True if Discord API is accessible
 */
async function testDiscordConnectivity(client) {
  try {
    if (!client || !client.isReady()) return false;

    // Test basic API connectivity
    await client.user.fetch();
    
    // Test guild access - get first available guild
    const guild = client.guilds.cache.first();
    if (!guild) return false;

    return true;
  } catch (err) {
    logError('startupHealthCheck discord connectivity test', err);
    return false;
  }
}

/**
 * Perform comprehensive startup health check
 * @param {Client} client - Discord client
 * @returns {Promise<Object>} Health check results
 */
async function performStartupHealthCheck(client) {
  console.log('🏥 Starting startup health check...');

  const results = {
    captchaGenerator: false,
    verificationQueue: false,
    loggingSystem: false,
    guildConfig: false,
    discordConnectivity: false,
    overall: false
  };

  const tests = [
    { name: 'captchaGenerator', test: () => testCaptchaGenerator() },
    { name: 'verificationQueue', test: () => testVerificationQueue() },
    { name: 'loggingSystem', test: () => testLoggingSystem() },
    { name: 'guildConfig', test: () => testGuildConfig() },
    { name: 'discordConnectivity', test: () => testDiscordConnectivity(client) }
  ];

  let passedTests = 0;

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

  results.overall = passedTests === tests.length;

  if (results.overall) {
    console.log('✅ All startup health checks passed');
  } else {
    console.log(`⚠️ Startup health check: ${passedTests}/${tests.length} tests passed`);

    // Enable safe mode if critical systems failed
    const criticalFailures = ['captchaGenerator', 'verificationQueue', 'discordConnectivity']
      .filter(system => !results[system]);

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

/**
 * Initialize startup health check
 * @param {Client} client - Discord client
 */
async function initializeStartupHealthCheck(client) {
  // Wait a moment for client to be fully ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  return await performStartupHealthCheck(client);
}

module.exports = {
  performStartupHealthCheck,
  initializeStartupHealthCheck,
};
