"use strict";

/**
 * Ferry relay.
 *
 * Introduces two browsers holding the same room id and, when peer-to-peer
 * fails, forwards their frames. Everything it forwards is already encrypted
 * with a key derived from a PIN it never sees, so the relay is a dumb pipe by
 * construction. Nothing is written to disk and nothing is logged about
 * payloads.
 */

const { WebSocketServer } = require("ws");
const crypto = require("node:crypto");

const ROOM_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_CONTROL_BYTES = 128 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;
const IDLE_ROOM_MS = 10 * 60 * 1000;
const JOINS_PER_MINUTE = 60;
const HEARTBEAT_MS = 30_000;

/** roomId -> { peers: Set<WebSocket>, touched: number } */
const rooms = new Map();
/** ip -> { count, windowStart } */
const joinRates = new Map();

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function fail(socket, code, message) {
  send(socket, { t: "error", code, message });
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = joinRates.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    joinRates.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > JOINS_PER_MINUTE;
}

function leaveRoom(socket) {
  const roomId = socket.ferryRoom;
  if (!roomId) return;
  socket.ferryRoom = null;

  const room = rooms.get(roomId);
  if (!room) return;
  room.peers.delete(socket);

  for (const peer of room.peers) send(peer, { t: "peer", state: "left" });
  if (room.peers.size === 0) rooms.delete(roomId);
}

function joinRoom(socket, request, roomId) {
  if (socket.ferryRoom) return fail(socket, "already_joined", "This connection already has a room.");
  if (!ROOM_ID.test(roomId)) return fail(socket, "bad_room", "That room id is not valid.");
  if (rateLimited(clientIp(request))) {
    return fail(socket, "rate_limited", "Too many attempts. Wait a minute and try again.");
  }

  let room = rooms.get(roomId);
  if (!room) {
    room = { peers: new Set(), touched: Date.now() };
    rooms.set(roomId, room);
  }
  if (room.peers.size >= 2) {
    return fail(socket, "room_full", "Two devices are already paired with that code.");
  }

  const role = room.peers.size === 0 ? "initiator" : "joiner";
  room.peers.add(socket);
  room.touched = Date.now();
  socket.ferryRoom = roomId;

  send(socket, { t: "joined", role, occupants: room.peers.size });
  if (room.peers.size === 2) {
    for (const peer of room.peers) {
      if (peer !== socket) send(peer, { t: "peer", state: "joined" });
    }
  }
}

function forward(socket, payload, binary) {
  const room = rooms.get(socket.ferryRoom);
  if (!room) return;
  room.touched = Date.now();
  for (const peer of room.peers) {
    if (peer !== socket && peer.readyState === peer.OPEN) {
      peer.send(payload, { binary });
    }
  }
}

/**
 * Attach the relay to an existing http.Server.
 * @param {import('node:http').Server} server
 * @param {{ path?: string }} [options]
 */
function attachRelay(server, options = {}) {
  const path = options.path || "/ws";
  const wss = new WebSocketServer({ server, path, maxPayload: MAX_FRAME_BYTES });

  wss.on("connection", (socket, request) => {
    socket.ferryRoom = null;
    socket.isAlive = true;
    socket.id = crypto.randomBytes(6).toString("hex");

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        if (!socket.ferryRoom) return;
        forward(socket, data, true);
        return;
      }

      if (data.length > MAX_CONTROL_BYTES) {
        return fail(socket, "too_large", "That control frame is too large.");
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return fail(socket, "bad_json", "Control frames must be JSON.");
      }

      switch (message.t) {
        case "join":
          return joinRoom(socket, request, String(message.room || ""));
        case "signal":
          if (!socket.ferryRoom) return;
          return forward(
            socket,
            JSON.stringify({ t: "signal", payload: message.payload }),
            false,
          );
        case "leave":
          return leaveRoom(socket);
        default:
          return fail(socket, "unknown", "Unrecognised control frame.");
      }
    });

    socket.on("close", () => leaveRoom(socket));
    socket.on("error", () => leaveRoom(socket));
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);

  const reaper = setInterval(() => {
    const cutoff = Date.now() - IDLE_ROOM_MS;
    for (const [roomId, room] of rooms) {
      if (room.peers.size === 0 || room.touched < cutoff) {
        for (const peer of room.peers) peer.close(1000, "session expired");
        rooms.delete(roomId);
      }
    }
    const minuteAgo = Date.now() - 60_000;
    for (const [ip, entry] of joinRates) {
      if (entry.windowStart < minuteAgo) joinRates.delete(ip);
    }
  }, 60_000);

  // Background housekeeping should not by itself keep Node alive: without
  // this, closing the http server leaves the process running on these two
  // timers alone.
  heartbeat.unref?.();
  reaper.unref?.();

  const stop = () => {
    clearInterval(heartbeat);
    clearInterval(reaper);
  };

  wss.on("close", stop);
  // A WebSocketServer bound to an existing server is not closed when that
  // server is, so shut it down alongside its host.
  server.on("close", () => {
    stop();
    for (const socket of wss.clients) socket.terminate();
    wss.close();
  });

  return wss;
}

function stats() {
  let paired = 0;
  for (const room of rooms.values()) if (room.peers.size === 2) paired += 1;
  return { rooms: rooms.size, paired };
}

module.exports = { attachRelay, stats };

/* Run standalone: `node server/relay.js` */
if (require.main === module) {
  const http = require("node:http");
  const port = Number(process.env.PORT || 8081);

  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, ...stats() }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Ferry relay. Connect a WebSocket to /ws.\n");
  });

  attachRelay(server);
  server.listen(port, () => {
    console.log(`Ferry relay listening on port ${port} (WebSocket path /ws)`);
  });
}
