/**
 * The Cloudflare Worker relay, exercised against a stand-in for the Durable
 * Object runtime. The point is that it speaks the same protocol as
 * server/relay.js — the front end has no way to tell which one it reached, so
 * any divergence is a bug in one of them.
 */

import test from "node:test";
import assert from "node:assert/strict";
import worker, { Room } from "../worker/index.js";

const ROOM = "aaaaaaaaaaaaaaaabbbbbb";

/** A socket with the four methods the Durable Object runtime provides. */
function fakeSocket() {
  const sent = [];
  let attachment;
  return {
    sent,
    send: (payload) => sent.push(payload),
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: () => attachment,
    /** Messages decoded back from JSON, for readable assertions. */
    received: () => sent.map((raw) => (typeof raw === "string" ? tryParse(raw) : raw)),
    last: () => {
      const raw = sent[sent.length - 1];
      return typeof raw === "string" ? tryParse(raw) : raw;
    },
  };
}

function tryParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Stands in for DurableObjectState, which is just a socket registry here. */
function fakeRoom() {
  const sockets = [];
  const room = new Room(
    {
      acceptWebSocket: (socket) => sockets.push(socket),
      getWebSockets: () => sockets,
    },
    {},
  );
  room.connect = () => {
    const socket = fakeSocket();
    sockets.push(socket);
    socket.serializeAttachment({ room: ROOM, joined: false });
    return socket;
  };
  return room;
}

/** Connect and join, the way a real client opens a session. */
function joined(room) {
  const socket = room.connect();
  room.webSocketMessage(socket, JSON.stringify({ t: "join", room: ROOM }));
  return socket;
}

test("two devices sharing a room id are introduced to each other", () => {
  const room = fakeRoom();

  const a = joined(room);
  assert.deepEqual(a.last(), { t: "joined", role: "initiator", occupants: 1 });

  const b = joined(room);
  assert.deepEqual(b.last(), { t: "joined", role: "joiner", occupants: 2 });

  // The one already waiting is told somebody arrived.
  assert.deepEqual(a.last(), { t: "peer", state: "joined" });
});

test("signalling and binary frames are forwarded verbatim", () => {
  const room = fakeRoom();
  const a = joined(room);
  const b = joined(room);

  room.webSocketMessage(a, JSON.stringify({ t: "signal", payload: "k:PUBLICKEY" }));
  assert.deepEqual(b.last(), { t: "signal", payload: "k:PUBLICKEY" });

  const sealed = Uint8Array.from([0, 1, 2, 250, 251, 255]).buffer;
  room.webSocketMessage(b, sealed);
  assert.deepEqual(a.last(), sealed, "an encrypted frame must arrive untouched");
});

test("a third device is refused rather than displacing either of the two", () => {
  const room = fakeRoom();
  const a = joined(room);
  const b = joined(room);

  const c = joined(room);
  assert.equal(c.last().t, "error");
  assert.equal(c.last().code, "room_full");

  // The pair is undisturbed.
  room.webSocketMessage(a, JSON.stringify({ t: "signal", payload: "still here" }));
  assert.deepEqual(b.last(), { t: "signal", payload: "still here" });
});

test("the remaining device is told when its peer goes away", () => {
  const room = fakeRoom();
  const a = joined(room);
  const b = joined(room);

  room.webSocketClose(b);
  assert.deepEqual(a.last(), { t: "peer", state: "left" });

  // And the freed slot is genuinely free again.
  const c = joined(room);
  assert.deepEqual(c.last(), { t: "joined", role: "joiner", occupants: 2 });
});

test("malformed control frames are rejected without dropping the connection", () => {
  const room = fakeRoom();
  const socket = room.connect();

  room.webSocketMessage(socket, "this is not json");
  assert.equal(socket.last().code, "bad_json");

  room.webSocketMessage(socket, JSON.stringify({ t: "join", room: "short" }));
  assert.equal(socket.last().code, "bad_room");

  room.webSocketMessage(socket, JSON.stringify({ t: "nonsense" }));
  assert.equal(socket.last().code, "unknown");

  // Still usable after all of that.
  room.webSocketMessage(socket, JSON.stringify({ t: "join", room: ROOM }));
  assert.equal(socket.last().t, "joined");
});

test("a device cannot occupy two rooms on one connection", () => {
  const room = fakeRoom();
  const socket = joined(room);
  room.webSocketMessage(socket, JSON.stringify({ t: "join", room: ROOM }));
  assert.equal(socket.last().code, "already_joined");
});

test("a join naming a different room than the one routed to is refused", () => {
  const room = fakeRoom();
  const socket = room.connect();
  // This object *is* one room; claiming another means the socket was routed
  // here for a room it is not asking about.
  room.webSocketMessage(
    socket,
    JSON.stringify({ t: "join", room: "ccccccccccccccccdddddd" }),
  );
  assert.equal(socket.last().code, "bad_room");
});

test("data from a socket that never joined is not forwarded", () => {
  const room = fakeRoom();
  const a = joined(room);
  const lurker = room.connect();

  room.webSocketMessage(lurker, Uint8Array.from([1, 2, 3]).buffer);
  room.webSocketMessage(lurker, JSON.stringify({ t: "signal", payload: "x" }));

  assert.deepEqual(a.received(), [
    { t: "joined", role: "initiator", occupants: 1 },
  ], "nothing from the lurker should have reached the joined device");
});

test("repeatedly grabbing a slot in one room is capped", () => {
  const room = fakeRoom();
  let limited = false;
  for (let i = 0; i < 40; i += 1) {
    const socket = room.connect();
    room.webSocketMessage(socket, JSON.stringify({ t: "join", room: ROOM }));
    room.webSocketClose(socket);
    if (socket.last()?.code === "rate_limited") limited = true;
  }
  assert.ok(limited, "a room must stop handing out slots to a hammering client");
});

/* ---------------------------------------------------------------- */
/* Routing                                                           */
/* ---------------------------------------------------------------- */

/** Records which Durable Object name the Worker asked for. */
function fakeEnv() {
  const asked = [];
  return {
    asked,
    FERRY_ROOM: {
      idFromName: (name) => {
        asked.push(name);
        return { name };
      },
      // The real runtime answers an upgrade with status 101 and a socket.
      // Node's Response rejects that status, so the stub returns a sentinel
      // instead: this test is about which object was addressed, not about the
      // handshake, which only Cloudflare can perform.
      get: () => ({ fetch: async () => new Response("routed to the room") }),
    },
  };
}

const upgrade = { headers: { Upgrade: "websocket" } };

test("/health answers so a platform check can see the relay is up", async () => {
  const response = await worker.fetch(new Request("https://relay/health"), fakeEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("a socket is routed to the object named by its room", async () => {
  const env = fakeEnv();
  const response = await worker.fetch(
    new Request(`https://relay/ws?room=${ROOM}`, upgrade),
    env,
  );
  assert.equal(await response.text(), "routed to the room");
  assert.deepEqual(env.asked, [ROOM], "both devices must resolve to this name");
});

test("a missing or malformed room is refused before reaching an object", async () => {
  const env = fakeEnv();
  for (const url of [
    "https://relay/ws",
    "https://relay/ws?room=short",
    "https://relay/ws?room=has spaces and is long enough",
  ]) {
    const response = await worker.fetch(new Request(url, upgrade), env);
    assert.equal(response.status, 400, `${url} should be refused`);
  }
  assert.deepEqual(env.asked, [], "no object should have been addressed");
});

test("anything that is not /ws gets a plain explanation", async () => {
  const response = await worker.fetch(new Request("https://relay/"), fakeEnv());
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Connect a WebSocket to \/ws/);
});
