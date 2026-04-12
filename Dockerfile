# syntax = docker/dockerfile:1

# ปรับ NODE_VERSION ตามที่ต้องการ
ARG NODE_VERSION=25.2.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# แอปพลิเคชัน Node.js อยู่ที่นี่
WORKDIR /app

# ตั้งค่าสภาพแวดล้อม production
ENV NODE_ENV="production"


# สเตจ build แบบใช้ครั้งเดียวเพื่อลดขนาดอิเมจสุดท้าย
FROM base AS build

# ติดตั้งแพ็กเกจที่จำเป็นสำหรับสร้าง node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# ติดตั้ง node modules
COPY package-lock.json package.json ./
RUN npm ci

# คัดลอกโค้ดแอปพลิเคชัน
COPY . .


# สเตจสุดท้ายสำหรับอิเมจแอป
FROM base

# คัดลอกแอปพลิเคชันที่สร้างแล้ว
COPY --from=build /app /app

#  เริ่มเซิร์ฟเวอร์ตามค่าเริ่มต้น สามารถเปลี่ยนแปลงได้ขณะรันไทม์
EXPOSE 3000
CMD [ "npm", "run", "start" ]
