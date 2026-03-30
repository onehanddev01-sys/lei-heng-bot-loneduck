## LoneDuck Security Bot

> ⚠️ **NEVER commit .env or real tokens.** If tokens are exposed, revoke them immediately at Discord Developer Portal and Telegram BotFather.

**LoneDuck Security Bot** คือ Discord Bot สำหรับรักษาความปลอดภัยเซิร์ฟเวอร์ `"LoneDuck"` พร้อมระบบ Verify, ตรวจสอบอายุบัญชี, Raid Detection, Logging และ Telegram Alerts

### ฟีเจอร์หลัก

- **ระบบ Verify**
  - เมื่อมีผู้ใช้เข้าร่วมเซิร์ฟเวอร์ บอทจะส่ง Verify Panel ในห้อง `WELCOME_CHANNEL_ID`
  - มีปุ่ม **Verify**
  - เมื่อกดปุ่ม บอทจะสร้าง Captcha ตัวเลขสุ่ม 4–6 หลัก
  - ผู้ใช้ต้องพิมพ์รหัส Captcha ในห้อง welcome ภายในเวลาที่กำหนด
  - ตอบถูก:
    - เพิ่ม role `VERIFY_ROLE_ID`
    - ส่งข้อความต้อนรับ: `ยินดีต้อนรับสู่ LoneDuck!`
    - บันทึก log ใน `LOG_CHANNEL_ID`
  - ตอบผิด:
    - ให้ลองใหม่ได้ สูงสุด 3 ครั้ง
    - ถ้าครบ 3 ครั้ง:
      - Kick ผู้ใช้
      - บันทึก log
      - ส่งแจ้งเตือนไป Telegram

- **ตรวจสอบอายุบัญชี**
  - เมื่อมีผู้ใช้เข้ามา ตรวจสอบวันสร้างบัญชี Discord
  - ถ้าอายุบัญชีต่ำกว่า 7 วัน:
    - ไม่ให้ verify
    - บันทึก log (`Suspicious account`)
    - ส่งแจ้งเตือนไป Telegram

- **ระบบตรวจจับ Raid**
  - ถ้ามีผู้ใช้มากกว่า 5 คนเข้าเซิร์ฟเวอร์ภายใน 10 วินาที:
    - ส่ง RAID ALERT
    - บันทึกใน `LOG_CHANNEL_ID`
    - ส่งแจ้งเตือนไป Telegram

- **ระบบ Logging**
  - บันทึกเหตุการณ์ลงทั้ง:
    - Discord (ใช้ Embed ส่งเข้า `LOG_CHANNEL_ID`)
    - ไฟล์ log ในโฟลเดอร์ `logs` (เช่น `logs/bot.log`)
  - เหตุการณ์ที่บันทึก:
    - User joined
    - Verification success
    - Verification failed
    - User kicked
    - Suspicious account
    - Raid detected

- **Telegram Alerts**
  - ส่งแจ้งเตือนเมื่อ:
    - Raid detected
    - Suspicious account joined
    - Verification failed 3 times
    - User kicked

### การติดตั้งและรันบอท

1. **ติดตั้ง dependencies**

```bash
npm install
```

2. **สร้างไฟล์ `.env`**

คัดลอกจาก `.env.example`

```bash
cp .env.example .env
```

จากนั้นเติมค่าจริงของคุณลงใน `.env` (ห้าม commit หรือแชร์ไฟล์นี้)

```env
DISCORD_BOT_TOKEN=your_real_discord_token
TELEGRAM_BOT_TOKEN=your_real_telegram_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

SERVER_NAME=LoneDuck

GUILD_ID=1479823674684084235
VERIFY_ROLE_ID=1479834121323680017
WELCOME_CHANNEL_ID=1479834322491146331
LOG_CHANNEL_ID=1479834690381680822
```

> **สำคัญมาก**: อย่าใส่ token จริงลงใน `.env.example` หรือไฟล์ที่ถูก commit ขึ้น Git / GitHub หรือแชร์ให้คนอื่นเห็น

3. **โครงสร้างโปรเจกต์**

```text
src/
  config.js          # อ่านค่า environment variables และ validate config
  events/
    ready.js         # รันครั้งเดียวตอนบอทออนไลน์
    guildMemberAdd.js# จัดการเมื่อมีคนเข้าเซิร์ฟเวอร์
    interactionCreate.js # จัดการปุ่ม Verify
  security/
    verification.js  # ระบบ Verify + Captcha + rate limit + ตรวจอายุบัญชี
    raidDetection.js # ระบบตรวจจับ Raid
  utils/
    logger.js        # logging ลงไฟล์ + ส่ง Embed เข้า Discord
    telegram.js      # ฟังก์ชันส่งข้อความแจ้งเตือนเข้า Telegram
```

4. **รันบอท**

```bash
npm start
```

### สิ่งที่ต้องตั้งค่าใน Discord

- ให้บอทอยู่ในเซิร์ฟเวอร์ `LoneDuck`
- ให้บอทมีสิทธิ์:
  - Manage Roles (เพื่อแจก role verify)
  - Kick Members
  - View Channels / Send Messages / Read Message History
- ตั้งค่า role, channel IDs ให้ตรงกับค่าใน `.env`

### ความปลอดภัยของ Token / Environment Variables

- **ห้าม** commit ไฟล์ `.env` หรือ token จริงใด ๆ ลงใน git repo
- `.gitignore` กันไฟล์/โฟลเดอร์สำคัญไม่ให้ขึ้น Git เช่น
  - `node_modules`
  - `.env`, `.env.*`
  - `logs`, `*.log`
  - `.vscode`, `.cursor`
  - `dist`, `build`, `coverage`
- ถ้า token เคยถูกโพสต์ลงเว็บ / แชท / dev tools:
  - ให้เข้าไปที่ Discord Developer Portal และ Telegram BotFather
  - **Revoke / Regenerate token ใหม่ทันที**
  - อัปเดตค่าใหม่ในไฟล์ `.env` บนเครื่องของคุณเท่านั้น

