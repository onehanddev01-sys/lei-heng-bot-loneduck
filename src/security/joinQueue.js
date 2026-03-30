// path: src/security/joinQueue.js
//
// Verification queue: processes guild member joins in batches to prevent overload
// when hundreds or thousands of users join simultaneously (raid scenarios).
//
// Protections: queue timeout (discard stale items), max queue size (prevent OOM),
// safe batch processing (one failure does not crash worker).
//
// SCALING: For horizontal scaling, this queue could be replaced with a Redis-backed
// queue (e.g. Bull/BullMQ) so multiple bot instances share the same work queue.

const { logError } = require('../utils/logger');

/** Queue of pending join handlers: { member, timestamp } */
const joinQueue = [];

/** Max items to process per worker tick. Keeps event loop responsive during raids. */
const BATCH_SIZE = 15;
/** Worker interval in ms. Balances throughput vs CPU usage. */
const WORKER_INTERVAL_MS = 50;

/** Max time (ms) an item can sit in queue before being discarded.
 * Prevents backlog of stale joins (e.g. member left) blocking fresh ones during recovery. */
const ITEM_TIMEOUT_MS = 30000;

/** Max queue size. Beyond this, oldest entries are discarded.
 * Prevents unbounded memory growth (OOM) during extreme raids on free hosting. */
const MAX_QUEUE_SIZE = 5000;

let workerIntervalId = null;
let isProcessing = false;

/**
 * Process a single member through the join handler logic.
 * Wrapped in try/catch so one failure does not crash the worker.
 * @param {Function} processFn - Async (member) => void
 */
async function processOne(processFn, member) {
  try {
    await processFn(member);
  } catch (err) {
    logError('joinQueue processOne', err);
  }
}

/**
 * Worker loop: dequeue up to BATCH_SIZE items, filter stale, process safely.
 * Uses async/await with error handling to prevent unhandled rejections.
 */
function runWorker(processFn) {
  if (isProcessing || joinQueue.length === 0) return;

  isProcessing = true;

  // Cleanup: discard stale items before processing. Items older than ITEM_TIMEOUT_MS
  // may no longer be relevant (member left) and would block fresh joins during recovery.
  const now = Date.now();
  while (joinQueue.length > 0 && now - joinQueue[0].timestamp > ITEM_TIMEOUT_MS) {
    joinQueue.shift();
  }

  if (joinQueue.length === 0) {
    isProcessing = false;
    return;
  }

  const batch = joinQueue.splice(0, BATCH_SIZE);

  (async () => {
    try {
      for (const item of batch) {
        await processOne(processFn, item.member);
      }
    } catch (err) {
      logError('joinQueue worker batch', err);
    } finally {
      isProcessing = false;
    }
  })();
}

/**
 * Add a member to the verification queue.
 * Overflow protection: if queue exceeds MAX_QUEUE_SIZE, drop oldest entry to prevent
 * unbounded memory growth during extreme raid bursts (free hosting has limited RAM).
 * @param {GuildMember} member
 */
function enqueue(member) {
  if (joinQueue.length > MAX_QUEUE_SIZE) {
    joinQueue.shift();
  }
  joinQueue.push({ member, timestamp: Date.now() });
}

/**
 * Start the queue worker. Call once at bot startup.
 * @param {Function} processFn - Async (member) => void - the join handler logic
 */
function startWorker(processFn) {
  if (workerIntervalId) return;
  workerIntervalId = setInterval(() => {
    try {
      runWorker(processFn);
    } catch (err) {
      logError('joinQueue startWorker tick', err);
      isProcessing = false;
    }
  }, WORKER_INTERVAL_MS);
}

/**
 * Stop the worker (e.g. graceful shutdown).
 */
function stopWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
}

function getQueueLength() {
  return joinQueue.length;
}

function clearQueue() {
  const cleared = joinQueue.length;
  joinQueue.length = 0;
  return cleared;
}

/**
 * Force cleanup of old queue entries (for memory guard).
 * Clears items older than 60s and trims to 500 max. Returns number cleared.
 */
function forceCleanup() {
  const now = Date.now();
  const cutoff = now - 60_000;
  let cleared = 0;
  while (joinQueue.length > 0 && now - joinQueue[0].timestamp > cutoff) {
    joinQueue.shift();
    cleared++;
  }
  while (joinQueue.length > 500) {
    joinQueue.shift();
    cleared++;
  }
  return cleared;
}

module.exports = {
  enqueue,
  startWorker,
  stopWorker,
  getQueueLength,
  clearQueue,
  forceCleanup,
};
