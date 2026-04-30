// Server entry point - Express + Colyseus server

import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import http from "http";

import { TrucoRoom } from "./rooms/TrucoRoom.js";

const port = Number(process.env.PORT || 2567);
const endpoint = process.env.ENDPOINT || "localhost";

// Create HTTP & WebSocket servers
const app = express();
const server = http.createServer(app);
const transport = new WebSocketTransport({ server });

// Create Colyseus server
const gameServer = new Server({
  transport,
});

// Define the Truco room
gameServer.define("truco", TrucoRoom);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static files (built client)
app.use(express.static("dist"));

// Start server
gameServer.listen(port)
  .then(() => {
    console.log(`\n🎮 TrucoAI Server running on ws://${endpoint}:${port}`);
    console.log(`📊 Monitor: http://${endpoint}:${port}/monitor\n`);
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  gameServer.close();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("\nShutting down server...");
  gameServer.close();
  server.close(() => process.exit(0));
});
