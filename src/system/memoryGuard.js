// path: src/system/memoryGuard.js
//
// Memory guard: protects against memory leaks or extreme traffic spikes.
// Checks every 20 seconds. If heap exceeds MAX_HEAP_MB, triggers cleanup:
// clears old queue entries, expired verification sessions, runs GC if available.

const { logError } = require('../utils/logger');

const MAX_HEAP_MB = 450;
const CHECK_INTERVAL_MS = 20000;

let intervalId = null;

/**
 * Run memory guard check. Triggers cleanup if heap exceeds limit.
 */
async function runMemoryGuard() {
  try {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;

    if (heapUsedMB < MAX_HEAP_MB) return;

    const { forceCleanup: joinQueueForceCleanup } = require('../security/joinQueue');
    const { forceSessionCleanup } = require('../verification/verificationService');

    let cleared = 0;

    if (typeof joinQueueForceCleanup === 'function') {
      cleared += joinQueueForceCleanup();
    }

    if (typeof forceSessionCleanup === 'function') {
      forceSessionCleanup();
      cleared++;
    }

    if (typeof global.gc === 'function') {
      global.gc();
    }

    logError(
      `[MemoryGuard] Heap ${heapUsedMB.toFixed(1)}MB > ${MAX_HEAP_MB}MB - cleared queue entries: ${cleared}`,
      new Error('MemoryGuard'),
    );
  } catch (err) {
    logError('memoryGuard runMemoryGuard', err);
  }
}

/**
 * Start the memory guard. Call once at bot startup.
 */
function startMemoryGuard() {
  if (intervalId) return;
  intervalId = setInterval(runMemoryGuard, CHECK_INTERVAL_MS);
}

/**
 * Stop the memory guard.
 */
function stopMemoryGuard() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startMemoryGuard,
  stopMemoryGuard,
};
