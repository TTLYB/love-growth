FROM node:24

WORKDIR /app

# 先复制所有文件
COPY . .

# 安装依赖（此时不会有 postinstall 干扰）
RUN npm install

# 生成 Prisma Client
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "server.js"]