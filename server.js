import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import adapterPkg from '@prisma/adapter-pg';
const { PrismaPg } = adapterPkg;
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
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());
// 提供 public 目录下的静态文件（你的 index.html 放这里）
app.use(express.static(join(__dirname, 'public')));

// GET 路由（方便浏览器直接获取房间码）
app.get("/create-room", async (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = await prisma.room.create({ data: { roomCode } });
  res.json(room);
});

// 原有的 POST 路由保留
app.post("/create-room", async (req, res) => {
  const roomCode = Math.random().toString(36).substring(2, 8);
  const room = await prisma.room.create({ data: { roomCode } });
  res.json(room);
});

app.get("/tasks/:roomCode", async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { roomCode: req.params.roomCode },
    include: { tasks: true }
  });
  res.json(room.tasks);
});

app.post("/tasks", async (req, res) => {
  const { roomCode, text } = req.body;
  const room = await prisma.room.findUnique({ where: { roomCode } });
  const task = await prisma.task.create({ data: { text, roomId: room.id } });
  io.to(roomCode).emit("taskAdded", task);
  res.json(task);
});

io.on("connection", (socket) => {
  console.log("用户连接");
  socket.on("joinRoom", (roomCode) => {
    socket.join(roomCode);
  });
  socket.on("sendMessage", async (data) => {
    const room = await prisma.room.findUnique({ where: { roomCode: data.roomCode } });
    const message = await prisma.chat.create({
      data: { sender: data.sender, message: data.message, roomId: room.id }
    });
    io.to(data.roomCode).emit("newMessage", message);
  });
});

server.listen(3000, () => {
  console.log("服务器启动：http://localhost:3000");
});