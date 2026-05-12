# 使用 Node.js 24 完整版镜像（包含 npm）
FROM node:24

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果有）
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制所有项目文件
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 暴露应用端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]