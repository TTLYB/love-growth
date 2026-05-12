import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { Server } from "socket.io";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// 创建房间
app.get("/create-room", async (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = await prisma.room.create({ data: { roomCode } });
  res.json(room);
});

app.post("/create-room", async (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8);
  const room = await prisma.room.create({ data: { roomCode } });
  res.json(room);
});

// 任务
app.get("/tasks/:roomCode", async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { roomCode: req.params.roomCode },
    include: { tasks: true }
  });
  res.json(room?.tasks || []);
});

app.post("/tasks", async (req, res) => {
  const { roomCode, text } = req.body;
  const room = await prisma.room.findUnique({ where: { roomCode } });
  if (!room) return res.status(404).json({ error: "房间不存在" });
  const task = await prisma.task.create({ data: { text, roomId: room.id } });
  io.to(roomCode).emit("taskAdded", task);
  res.json(task);
});

// ====== 日记接口（唯一一份，从这里开始） ======
app.get("/diaries/:roomCode", async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { roomCode: req.params.roomCode },
    include: { diaries: { orderBy: { createdAt: 'desc' } } }
  });
  if (!room) return res.json([]);
  res.json(room.diaries);
});

app.post("/diaries", async (req, res) => {
  const { roomCode, content, title, author } = req.body;
  if (!roomCode || !content) return res.status(400).json({ error: "参数错误" });

  const room = await prisma.room.findUnique({ where: { roomCode } });
  if (!room) return res.status(404).json({ error: "房间不存在" });

  const diary = await prisma.diary.create({
    data: {
      title: title || null,
      content,
      author: author || "匿名",
      roomId: room.id
    }
  });

  io.to(roomCode).emit("diaryAdded", diary);
  res.json(diary);
});

// Socket.IO 事件
io.on("connection", (socket) => {
  console.log("用户连接");

  socket.on("joinRoom", (roomCode) => {
    socket.join(roomCode);
    console.log(`用户加入成长房间: ${roomCode}`);
  });

  socket.on("joinDiaryRoom", (roomCode) => {
    socket.join(roomCode);
    console.log(`用户加入日记房间: ${roomCode}`);
  });

  socket.on("sendMessage", async (data) => {
    const room = await prisma.room.findUnique({ where: { roomCode: data.roomCode } });
    if (!room) return;
    const message = await prisma.chat.create({
      data: { sender: data.sender, message: data.message, roomId: room.id }
    });
    io.to(data.roomCode).emit("newMessage", message);
  });

  socket.on("join-room", (room) => {
    socket.join(room);
    console.log(`用户加入视频房间: ${room}`);
  });

  socket.on("video-action", (data) => {
    if (data && data.room) {
      socket.to(data.room).emit("sync-video", data);
    }
  });
});

// 启动时自动迁移
(async () => {
  console.log('⏳ 检查数据库连接并执行迁移...');
  const safeUrl = (process.env.DATABASE_URL || '').replace(/:\/\/(.*):(.*)@/, '://$1:****@');
  console.log('DATABASE_URL:', safeUrl);

  try {
    const { execSync } = await import('child_process');
    execSync('npx prisma db push', { stdio: 'inherit' });
    console.log('✅ 数据库迁移成功');
  } catch (err) {
    console.error('❌ 数据库迁移失败:', err.message);
  }
})();

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动：http://localhost:${PORT}`);
});