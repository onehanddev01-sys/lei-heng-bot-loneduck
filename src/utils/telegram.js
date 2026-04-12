
//  นำเข้า https module
const https = require('https');

//  ส่งข้อความไปยัง Telegram
async function sendTelegramMessage(message) {
  const { config } = require('../config');
  
  //  ตรวจสอบว่ามี credentials สำหรับ Telegram
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram credentials not configured, skipping message');
    return false;
  }

  //  สร้าง URL สำหรับ Telegram API
  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  //  สร้างข้อมูลที่จะส่ง
  const postData = JSON.stringify({
    chat_id: config.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  });

  //  สร้าง HTTP request ไปยัง Telegram API
  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      //  รวมข้อมูลที่ได้รับ
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        //  ตรวจสอบสถานะการตอบกลับ
        if (res.statusCode === 200) {
          console.log('✅ Telegram message sent successfully');
          resolve(true);
        } else {
          console.log(`❌ Telegram API error: ${res.statusCode} - ${data}`);
          resolve(false);
        }
      });
    });

    //  จัดการ error
    req.on('error', (err) => {
      console.log('❌ Telegram request error:', err.message);
      resolve(false);
    });

    //  ส่งข้อมูลและปิด connection
    req.write(postData);
    req.end();
  });
}

//  ส่งแจ้งเตือนการโจมตี Raid
async function sendRaidAlert(raidData) {
  //  สร้างข้อความแจ้งเตือน Raid
  const message = `
🚨 <b>RAID DETECTED</b> 🚨

📊 <b>Details:</b>
• Server: ${raidData.guildName || 'Unknown'}
• Join Count: ${raidData.joinCount} users
• Time Window: ${raidData.timeWindow} seconds
• Time: ${new Date().toLocaleString('th-TH')}

⚠️ <b>Action Required:</b>
Check server security and consider enabling lockdown mode.
  `.trim();

  return await sendTelegramMessage(message);
}

//  ส่งแจ้งเตือนบัญชีที่น่าสงสัย
async function sendSuspiciousAccountAlert(userData) {
  //  สร้างข้อความแจ้งเตือนบัญชีน่าสงสัย
  const message = `
🔍 <b>SUSPICIOUS ACCOUNT DETECTED</b> 🔍

👤 <b>User:</b>
• Username: ${userData.username || 'Unknown'}
• ID: ${userData.userId || 'Unknown'}
• Account Age: ${userData.accountAge || 'Unknown'} days
• Server: ${userData.guildName || 'Unknown'}

⚠️ <b>Reason:</b>
Account is less than 7 days old. Monitor this user closely.
  `.trim();

  return await sendTelegramMessage(message);
}

//  ส่งแจ้งเตือนการยืนยันตัวตนล้มเหลว
async function sendVerificationFailureAlert(failData) {
  //  สร้างข้อความแจ้งเตือนการยืนยันตัวตนล้มเหลว
  const message = `
❌ <b>VERIFICATION FAILED</b> ❌

👤 <b>User:</b>
• Username: ${failData.username || 'Unknown'}
• ID: ${failData.userId || 'Unknown'}
• Failed Attempts: ${failData.attemptCount || 'Unknown'}
• Action: ${failData.action || 'Unknown'}
• Server: ${failData.guildName || 'Unknown'}

🔒 <b>Security Action:</b>
${failData.action === 'kick' ? 'User has been kicked from the server.' : 'User has been warned.'}
  `.trim();

  return await sendTelegramMessage(message);
}

//  ส่งแจ้งเตือนผู้ใช้ถูกเตะ
async function sendUserKickedAlert(kickData) {
  //  สร้างข้อความแจ้งเตือนผู้ใช้ถูกเตะ
  const message =`
👢 <b>USER KICKED</b> 👢

👤 <b>User:</b>
• Username: ${kickData.username || 'Unknown'}
• ID: ${kickData.userId || 'Unknown'}
• Server: ${kickData.guildName || 'Unknown'}

📝 <b>Reason:</b>
${kickData.reason || 'No reason provided'}

⏰ <b>Time:</b>
${new Date().toLocaleString('th-TH')}
  `.trim();

  return await sendTelegramMessage(message);
}

//  exports
module.exports = {
  sendTelegramMessage,
  sendRaidAlert,
  sendSuspiciousAccountAlert,
  sendVerificationFailureAlert,
  sendUserKickedAlert,
};
