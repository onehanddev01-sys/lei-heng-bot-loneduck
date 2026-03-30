// path: src/utils/telegram.js
//
// Telegram integration for sending alerts and notifications

const https = require('https');

/**
 * Send message to Telegram chat
 * @param {string} message - Message to send
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendTelegramMessage(message) {
  const { config } = require('../config');
  
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram credentials not configured, skipping message');
    return false;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const postData = JSON.stringify({
    chat_id: config.TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  });

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Telegram message sent successfully');
          resolve(true);
        } else {
          console.log(`❌ Telegram API error: ${res.statusCode} - ${data}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.log('❌ Telegram request error:', err.message);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send raid alert to Telegram
 * @param {Object} raidData - Raid information
 * @param {number} raidData.joinCount - Number of joins
 * @param {number} raidData.timeWindow - Time window in seconds
 * @param {string} raidData.guildName - Server name
 */
async function sendRaidAlert(raidData) {
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

/**
 * Send suspicious account alert to Telegram
 * @param {Object} userData - User information
 * @param {string} userData.username - User's username
 * @param {string} userData.userId - User's Discord ID
 * @param {number} userData.accountAge - Account age in days
 * @param {string} userData.guildName - Server name
 */
async function sendSuspiciousAccountAlert(userData) {
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

/**
 * Send verification failure alert to Telegram
 * @param {Object} failData - Failure information
 * @param {string} failData.username - User's username
 * @param {string} failData.userId - User's Discord ID
 * @param {number} failData.attemptCount - Number of failed attempts
 * @param {string} failData.action - Action taken (kick/warn)
 * @param {string} failData.guildName - Server name
 */
async function sendVerificationFailureAlert(failData) {
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

/**
 * Send user kicked alert to Telegram
 * @param {Object} kickData - Kick information
 * @param {string} kickData.username - User's username
 * @param {string} kickData.userId - User's Discord ID
 * @param {string} kickData.reason - Reason for kick
 * @param {string} kickData.guildName - Server name
 */
async function sendUserKickedAlert(kickData) {
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

module.exports = {
  sendTelegramMessage,
  sendRaidAlert,
  sendSuspiciousAccountAlert,
  sendVerificationFailureAlert,
  sendUserKickedAlert,
};
