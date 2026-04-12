
//  ฟังก์ชันช่วยสำหรับตัวแปรสภาพแวดล้อม  
function getEnv(name, defaultValue) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value;
}

//  ค่ากำหนดตัวแปรสภาพแวดล้อม  
const config = {
  //  โทเคนบอท Discord  
  DISCORD_BOT_TOKEN: getEnv('DISCORD_BOT_TOKEN'),
  //  ชื่อเซิร์ฟเวอร์ ค่าเริ่มต้น LoneDuck  
  SERVER_NAME: getEnv('SERVER_NAME', 'LoneDuck'),
  //  ID เซิร์ฟเวอร์ Discord  
  GUILD_ID: getEnv('GUILD_ID'),
  //  ID บทบาทการยืนยันตัวตน  
  VERIFY_ROLE_ID: getEnv('VERIFY_ROLE_ID'),
  //  ID ช่องทางต้อนรับ  
  WELCOME_CHANNEL_ID: getEnv('WELCOME_CHANNEL_ID'),
  //  ID ช่องทางบันทึกข้อมูล  
  LOG_CHANNEL_ID: getEnv('LOG_CHANNEL_ID'),
  //  ID บทบาทการกักกัน  
  QUARANTINE_ROLE_ID: getEnv('QUARANTINE_ROLE_ID'),
  //  โทเคนบอท Telegram  
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),
  //  ID แชท Telegram  
  TELEGRAM_CHAT_ID: getEnv('TELEGRAM_CHAT_ID'),
};

//  การตรวจสอบค่ากำหนด  
function validateConfig() {
  if (!config.DISCORD_BOT_TOKEN) {
    console.error('ERROR: Missing DISCORD_BOT_TOKEN in environment variables. Bot will exit.');
    console.log('Please set DISCORD_BOT_TOKEN in Railway Dashboard -> Project -> Variables');
    process.exit(1);
  }
}

//  การส่งออกโมดูล  
module.exports = {
  config,
  validateConfig,
};

