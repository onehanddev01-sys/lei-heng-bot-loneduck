
//  นำเข้า logger สำหรับบันทึก error
const { logError } = require('../utils/logger');

//  สถานะการปิดระบบ
let isShuttingDown = false;
//  callbacks สำหรับการปิดระบบ
let shutdownCallbacks = [];

// ลงทะเบียน callback สำหรับการปิดระบบ
function registerShutdownCallback(callback) {
  shutdownCallbacks.push(callback);
}

//  ดำเนินการปิดระบบอย่างสมบูรณ์
async function performGracefulShutdown(signal) {
  // ป้องกันการปิดระบบซ้ำซ้อน
  if (isShuttingDown) {
    console.log('Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  console.log(`\n🔄 Received ${signal}, starting graceful shutdown...`);

  try {
    // หยุดการเริ่มต้น verification sessions ใหม่
    console.log('📋 Stopping new verification sessions...');
    
    // บันทึกสถานะที่ทำงานอยู่
    console.log('💾 Saving active state...');
    try {
      const { saveGuildConfigs } = require('../utils/guildConfig');
      await saveGuildConfigs();
    } catch (saveErr) {
      logError('gracefulShutdown save state', saveErr);
    }
    
    // หยุด verification queue
    console.log('⏳ Finishing current verification queue...');
    try {
      const { stopWorker } = require('../security/joinQueue');
      stopWorker();
    } catch (queueErr) {
      logError('gracefulShutdown stop queue', queueErr);
    }
    
    // หยุดการตรวจสอบสุขภาพระบบ
    console.log('🏥 Stopping health monitoring...');
    try {
      const { stopHealthMonitor } = require('../system/healthMonitor');
      stopHealthMonitor();
    } catch (healthErr) {
      logError('gracefulShutdown stop health monitor', healthErr);
    }
    
    // รัน shutdown callbacks
    console.log('🔧 Running shutdown callbacks...');
    for (const callback of shutdownCallbacks) {
      try {
        await callback();
      } catch (err) {
        logError('gracefulShutdown callback error', err);
      }
    }
    
    // ตัดการเชื่อมต่อจาก Discord
    console.log('🔌 Disconnecting from Discord...');
    
    // รอ 1 วินาที
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // การปิดระบบสำเร็จ
    console.log('✅ Graceful shutdown completed successfully');
    process.exit(0);
  } catch (err) {
    //  เกิดข้อผิดพลาดระหว่างการปิดระบบ
    logError('gracefulShutdown unexpected error', err);
    console.error('❌ Error during graceful shutdown, forcing exit');
    process.exit(1);
  }
}

//  ตั้งค่า handlers สำหรับการปิดระบบอย่างสมบูรณ์
function initializeGracefulShutdown(client) {
  // ลงทะเบียน callback สำหรับตัดการเชื่อมต่อ Discord
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

  //  handler สำหรับ SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    performGracefulShutdown('SIGINT');
  });

  //  handler สำหรับ SIGTERM (termination signal)
  process.on('SIGTERM', () => {
    performGracefulShutdown('SIGTERM');
  });

  //  handler สำหรับ uncaught exception
  process.on('uncaughtException', (err) => {
    if (isShuttingDown) {
      console.error('Uncaught exception during shutdown:', err);
      process.exit(1);
    }
  });

  //  handler สำหรับ unhandled rejection
  process.on('unhandledRejection', (reason, promise) => {
    if (isShuttingDown) {
      console.error('Unhandled rejection during shutdown:', reason);
      process.exit(1);
    }
  });

  console.log('🛡️ Graceful shutdown handlers initialized');
}

// ตรวจสอบว่ากำลังปิดระบบอยู่หรือไม่
function isShuttingDownInProgress() {
  return isShuttingDown;
}

//  exports
module.exports = {
  registerShutdownCallback,
  performGracefulShutdown,
  initializeGracefulShutdown,
  isShuttingDownInProgress,
};
