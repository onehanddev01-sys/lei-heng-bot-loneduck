// path: src/system/gracefulShutdown.js
//
// Graceful shutdown handling: handles SIGINT and SIGTERM signals to safely
// shut down the bot, saving state and cleaning up resources.

const { logError } = require('../utils/logger');

let isShuttingDown = false;
let shutdownCallbacks = [];

/**
 * Register a callback to be called during shutdown
 * @param {Function} callback - Async function to call during shutdown
 */
function registerShutdownCallback(callback) {
  shutdownCallbacks.push(callback);
}

/**
 * Perform graceful shutdown
 * @param {string} signal - Signal that triggered shutdown (SIGINT or SIGTERM)
 */
async function performGracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  console.log(`\n🔄 Received ${signal}, starting graceful shutdown...`);

  try {
    // 1. Stop accepting new verification sessions
    console.log('📋 Stopping new verification sessions...');
    
    // 2. Save active state to persistent storage
    console.log('💾 Saving active state...');
    try {
      const { saveGuildConfigs } = require('../utils/guildConfig');
      await saveGuildConfigs();
    } catch (saveErr) {
      logError('gracefulShutdown save state', saveErr);
    }
    
    // 3. Finish processing current verification queue
    console.log('⏳ Finishing current verification queue...');
    try {
      const { stopWorker } = require('../security/joinQueue');
      stopWorker();
    } catch (queueErr) {
      logError('gracefulShutdown stop queue', queueErr);
    }
    
    // 4. Stop health monitoring systems
    console.log('🏥 Stopping health monitoring...');
    try {
      const { stopHealthMonitor } = require('../system/healthMonitor');
      stopHealthMonitor();
    } catch (healthErr) {
      logError('gracefulShutdown stop health monitor', healthErr);
    }
    
    // 5. Call registered shutdown callbacks (cleanup tasks)
    console.log('🔧 Running shutdown callbacks...');
    for (const callback of shutdownCallbacks) {
      try {
        await callback();
      } catch (err) {
        logError('gracefulShutdown callback error', err);
      }
    }
    
    // 6. Disconnect safely from Discord API
    console.log('🔌 Disconnecting from Discord...');
    
    // Give a moment for final operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Graceful shutdown completed successfully');
    process.exit(0);
  } catch (err) {
    logError('gracefulShutdown unexpected error', err);
    console.error('❌ Error during graceful shutdown, forcing exit');
    process.exit(1);
  }
}

/**
 * Initialize graceful shutdown handlers
 * @param {Client} client - Discord client instance
 */
function initializeGracefulShutdown(client) {
  // Register Discord client cleanup
  registerShutdownCallback(async () => {
    if (client && client.isReady()) {
      try {
        await client.destroy();
        console.log('🔌 Discord client disconnected');
      } catch (err) {
        logError('gracefulShutdown discord disconnect', err);
      }
    }
  });

  // Handle process signals
  process.on('SIGINT', () => {
    performGracefulShutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    performGracefulShutdown('SIGTERM');
  });

  // Handle uncaught exceptions that might occur during shutdown
  process.on('uncaughtException', (err) => {
    if (isShuttingDown) {
      console.error('Uncaught exception during shutdown:', err);
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    if (isShuttingDown) {
      console.error('Unhandled rejection during shutdown:', reason);
      process.exit(1);
    }
  });

  console.log('🛡️ Graceful shutdown handlers initialized');
}

/**
 * Check if shutdown is in progress
 * @returns {boolean} True if shutting down
 */
function isShuttingDownInProgress() {
  return isShuttingDown;
}

module.exports = {
  registerShutdownCallback,
  performGracefulShutdown,
  initializeGracefulShutdown,
  isShuttingDownInProgress,
};
