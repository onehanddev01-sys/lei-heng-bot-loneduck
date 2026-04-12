
//  นำเข้า logger สำหรับบันทึก error
const { logError } = require('../utils/logger');

//  การตั้งค่า memory guard
const MAX_HEAP_MB = 450;
const CHECK_INTERVAL_MS = 20000;

//  ID ของ interval
let intervalId = null;

//  ดำเนินการ memory guard
async function runMemoryGuard() {
  try {
    //  ดึงข้อมูลการใช้หน่วยความจำ
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;

    //  ตรวจสอบว่าการใช้หน่วยความจำต่ำกว่าค่าเกณฑ์หรือไม่
    if (heapUsedMB < MAX_HEAP_MB) return;

    //  นำเข้าฟังก์ชัน cleanup
    const { forceCleanup: joinQueueForceCleanup } = require('../security/joinQueue');
    const { forceSessionCleanup } = require('../verification/verificationService');

    let cleared = 0;

    //  cleanup join queue
    if (typeof joinQueueForceCleanup === 'function') {
      cleared += joinQueueForceCleanup();
    }

    //  cleanup verification sessions
    if (typeof forceSessionCleanup === 'function') {
      forceSessionCleanup();
      cleared++;
    }

    // บังคับ garbage collection ถ้ามีให้ใช้
    if (typeof global.gc === 'function') {
      global.gc();
    }

    // บันทึกการทำงานของ memory guard
    logError(
      `[MemoryGuard] Heap ${heapUsedMB.toFixed(1)}MB > ${MAX_HEAP_MB}MB - cleared queue entries: ${cleared}`,
      new Error('MemoryGuard'),
    );
  } catch (err) {
    logError('memoryGuard runMemoryGuard', err);
  }
}

//  เริ่มต้น memory guard
function startMemoryGuard() {
  // ป้องกันการสร้าง guard ซ้ำซ้อน
  if (intervalId) return;
  intervalId = setInterval(runMemoryGuard, CHECK_INTERVAL_MS);
}

//  หยุด memory guard
function stopMemoryGuard() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

//  exports
module.exports = {
  startMemoryGuard,
  stopMemoryGuard,
};
