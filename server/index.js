// index.js — express + ws bootstrap
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import { GameRoom } from "./room.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

const app = express();
const PUBLIC = path.join(__dirname, "..", "public");
app.get("/healthz", (_req, res) => res.type("text").send("ok"));
app.use(express.static(PUBLIC));
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const room = new GameRoom();
wss.on("connection", (ws) => {
  try { room.onConnect(ws); }
  catch (e) { console.error("onConnect:", e); try { ws.terminate(); } catch {} }
});
wss.on("error", (e) => console.error("wss error:", e));

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Empire Clash listening on " + PORT));