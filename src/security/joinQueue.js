
//  การบันทึกข้อผิดพลาด
const { logError } = require('../utils/logger');

//  อาร์เรย์คิวการเข้าร่วม
const joinQueue = [];

//  การตั้งค่าคิว
const BATCH_SIZE = 15;
const WORKER_INTERVAL_MS = 50;

//  การตั้งค่า timeout
const ITEM_TIMEOUT_MS = 30000;

//  ขีดจำกัดคิว
const MAX_QUEUE_SIZE = 5000;

//  สถานะ worker
let workerIntervalId = null;
let isProcessing = false;

//  ดำเนินการสมาชิกคนเดียว
async function processOne(processFn, member) {
  try {
    await processFn(member);
  } catch (err) {
    logError('joinQueue processOne', err);
  }
}

//  รัน worker เพื่อดำเนินการคิว
function runWorker(processFn) {
  //  ข้ามถ้ากำลังดำเนินการหรือว่าง
  if (isProcessing || joinQueue.length === 0) return;

  isProcessing = true;

  //  ลบรายการที่หมดอายุ
  const now = Date.now();
  while (joinQueue.length > 0 && now - joinQueue[0].timestamp > ITEM_TIMEOUT_MS) {
    joinQueue.shift();
  }

  //  ออกถ้าคิวว่าง
  if (joinQueue.length === 0) {
    isProcessing = false;
    return;
  }

  //  ดึง batch เพื่อดำเนินการ
  const batch = joinQueue.splice(0, BATCH_SIZE);

  //  ดำเนินการ batch แบบ asynchronous
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

//  เพิ่มสมาชิกในคิว
function enqueue(member) {
  //  ลบรายการเก่าสุดถ้าคิวเต็ม
  if (joinQueue.length > MAX_QUEUE_SIZE) {
    joinQueue.shift();
  }
  //  เพิ่มสมาชิกใหม่พร้อม timestamp
  joinQueue.push({ member, timestamp: Date.now() });
}

//  เริ่มต้น interval ของ worker
function startWorker(processFn) {
  //  ป้องกันการทำงานหลาย workers
  if (workerIntervalId) return;
  workerIntervalId = setInterval(() => {
    try {
      runWorker(processFn);
    } catch (err) {
      logError('joinQueue worker interval', err);
    }
  }, WORKER_INTERVAL_MS);
}

//  หยุด interval ของ worker
function stopWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
}

//  ดึงความยาวคิว
function getQueueLength() {
  return joinQueue.length;
}

//  ล้างคิว
function clearQueue() {
  const cleared = joinQueue.length;
  joinQueue.length = 0;
  return cleared;
}

//  บังคับล้างรายการเก่า
function forceCleanup() {
  const now = Date.now();
  const cutoff = now - 60_000;
  let cleared = 0;
  //  ลบรายการที่เก่ากว่า 1 นาที
  while (joinQueue.length > 0 && now - joinQueue[0].timestamp > cutoff) {
    joinQueue.shift();
    cleared++;
  }
  //  จำกัดคิวเป็น 500 รายการ
  while (joinQueue.length > 500) {
    joinQueue.shift();
    cleared++;
  }
  return cleared;
}

//  exports
module.exports = {
  enqueue,
  startWorker,
  stopWorker,
  getQueueLength,
  clearQueue,
  forceCleanup,
};
