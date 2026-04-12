
//  นำเข้า logger สำหรับบันทึก error
const { logError } = require('../utils/logger');

//  การตั้งค่าการตรวจสอบสุขภาพ
const HEALTH_CHECK_INTERVAL_MS = 30000;
//  ค่าเกณฑ์การใช้ heap memory
const HEAP_WARNING_THRESHOLD = 0.8;
const HEAP_CRITICAL_THRESHOLD = 0.9;

//  ID ของ interval
let intervalId = null;
//  timestamp ของการตรวจสอบครั้งล่าสุด
let lastLoopCheck = Date.now();

//  ดึงค่าความหน่วงของ event loop
function getEventLoopDelayMs() {
  const now = Date.now();
  const delay = now - lastLoopCheck;
  lastLoopCheck = now;
  return delay;
}

//  ดำเนินการตรวจสอบสุขภาพระบบ
function runHealthCheck() {
  try {
    //  ดึงข้อมูลการใช้หน่วยความจำ
    const mem = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());

    // คำนวณสัดส่วนการใช้ heap memory
    let heapUsedRatio = 0;
    try {
      const v8 = require('v8');
      const heap = v8.getHeapStatistics();
      heapUsedRatio = mem.heapUsed / heap.heap_size_limit;
    } catch {
      //  ใช้ค่าเริ่มต้น 512MB ถ้าไม่สามารถดึงข้อมูลได้
      heapUsedRatio = mem.heapUsed / (512 * 1024 * 1024);
    }

    //  ดึงค่าความหน่วงของ event loop
    const loopDelay = getEventLoopDelayMs();

    //  สร้างข้อความสถานะสุขภาพ
    const msg =
      `Health: heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB, ` +
      `uptime ${uptimeSec}s, loop delay ~${loopDelay}ms`;

    //  ตรวจสอบค่าเกณฑ์วิกฤต
    if (heapUsedRatio >= HEAP_CRITICAL_THRESHOLD) {
      logError(
        `[CRITICAL] Heap usage ${(heapUsedRatio * 100).toFixed(1)}% - ${msg}`,
        new Error('HealthMonitor'),
      );
    } else if (heapUsedRatio >= HEAP_WARNING_THRESHOLD) {
      //  ตรวจสอบค่าเกณฑ์เตือน
      logError(
        `[WARNING] Heap usage ${(heapUsedRatio * 100).toFixed(1)}% - ${msg}`,
        new Error('HealthMonitor'),
      );
    }
  } catch (err) {
    logError('healthMonitor runHealthCheck', err);
  }
}

//  เริ่มต้นการตรวจสอบสุขภาพระบบ
function startHealthMonitor() {
  //  ป้องกันการสร้าง monitor ซ้ำซ้อน
  if (intervalId) return;
  lastLoopCheck = Date.now();
  intervalId = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
}

//  หยุดการตรวจสอบสุขภาพระบบ
function stopHealthMonitor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

//  exports
module.exports = {
  startHealthMonitor,
  stopHealthMonitor,
};
