// path: src/system/healthMonitor.js
//
// Bot health monitor: prevents silent death under load.
// Runs every 30 seconds. Tracks memory usage, event loop delay, uptime.
// Logs warnings at 80% heap, critical at 90%. Does not auto-restart.

const { logError } = require('../utils/logger');

const HEALTH_CHECK_INTERVAL_MS = 30000;
const HEAP_WARNING_THRESHOLD = 0.8; // 80%
const HEAP_CRITICAL_THRESHOLD = 0.9; // 90%

let intervalId = null;
let lastLoopCheck = Date.now();

/**
 * Measure approximate event loop delay.
 */
function getEventLoopDelayMs() {
  const now = Date.now();
  const delay = now - lastLoopCheck;
  lastLoopCheck = now;
  return delay;
}

/**
 * Run one health check. Uses process.memoryUsage() and v8 heap stats.
 */
function runHealthCheck() {
  try {
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    let heapUsedRatio = 0;
    try {
      const v8 = require('v8');
      const heap = v8.getHeapStatistics();
      heapUsedRatio = mem.heapUsed / heap.heap_size_limit;
    } catch {
      heapUsedRatio = mem.heapUsed / (512 * 1024 * 1024);
    }

    const loopDelay = getEventLoopDelayMs();

    const msg =
      `Health: heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB, ` +
      `uptime ${uptimeSec}s, loop delay ~${loopDelay}ms`;

    // Add performance metrics
    const cpuUsage = process.cpuUsage();
    const rssMB = mem.rss / 1024 / 1024;
    
    const perfMsg = `CPU: ${cpuUsage.user}μs/${cpuUsage.system}μs, RSS: ${rssMB.toFixed(1)}MB`;

    if (heapUsedRatio >= HEAP_CRITICAL_THRESHOLD) {
      logError(
        `[CRITICAL] Heap usage ${(heapUsedRatio * 100).toFixed(1)}% - ${msg} - ${perfMsg}`,
        new Error('HealthMonitor'),
      );
    } else if (heapUsedRatio >= HEAP_WARNING_THRESHOLD) {
      logError(
        `[WARNING] Heap usage ${(heapUsedRatio * 100).toFixed(1)}% - ${msg} - ${perfMsg}`,
        new Error('HealthMonitor'),
      );
    } else if (loopDelay > 100) {
      logError(
        `[WARNING] Event loop delay ${loopDelay}ms - ${msg} - ${perfMsg}`,
        new Error('HealthMonitor'),
      );
    }
  } catch (err) {
    logError('healthMonitor runHealthCheck', err);
  }
}

/**
 * Start the health monitor. Call once at bot startup.
 */
function startHealthMonitor() {
  if (intervalId) return;
  lastLoopCheck = Date.now();
  intervalId = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop the health monitor.
 */
function stopHealthMonitor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startHealthMonitor,
  stopHealthMonitor,
};
