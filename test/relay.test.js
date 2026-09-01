"use strict";

/**
 * Relay behaviour. The relay is the one always-on piece of Ferry, so the
 * properties asserted here are the ones the front end relies on: two devices
 * holding the same room id find each other, a third is refused, and whatever
 * one side sends arrives at the other untouched.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { WebSocket } = require("ws");
const { attachRelay } = require("../server/relay");

const ROOM = "aaaaaaaaaaaaaaaabbbbbb";

function listen() {
  const server = http.createServer();
  attachRelay(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port }),
    );
  });
}

/** A socket that queues what arrives so a test can await messages in order. */
function client(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.binaryType = "arraybuffer";
  const queue = [];
  const waiters = [];

  const deliver = (value) => {
    const waiter = waiters.shift();
    if (waiter) waiter(value);
    else queue.push(value);
  };

  socket.on("message", (data, isBinary) =>
    deliver(isBinary ? new Uint8Array(data) : JSON.parse(data.toString())),
  );

  socket.next = () =>
    queue.length
      ? Promise.resolve(queue.shift())
      : new Promise((resolve) => waiters.push(resolve));

  socket.ready = new Promise((resolve, reject) => {
    socket.on("open", resolve);
    socket.on("error", reject);
  });

  return socket;
}

test("two devices sharing a room id are introduced to each other", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = client(port);
  await a.ready;
  a.send(JSON.stringify({ t: "join", room: ROOM }));
  assert.deepEqual(await a.next(), { t: "joined", role: "initiator", occupants: 1 });

  const b = client(port);
  await b.ready;
  b.send(JSON.stringify({ t: "join", room: ROOM }));
  assert.deepEqual(await b.next(), { t: "joined", role: "joiner", occupants: 2 });

  // The one already waiting is told somebody arrived.
  assert.deepEqual(await a.next(), { t: "peer", state: "joined" });

  a.close();
  b.close();
});

test("signalling and binary frames are forwarded verbatim", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = client(port);
  const b = client(port);
  await Promise.all([a.ready, b.ready]);

  a.send(JSON.stringify({ t: "join", room: ROOM }));
  await a.next();
  b.send(JSON.stringify({ t: "join", room: ROOM }));
  await b.next();
  await a.next();

  a.send(JSON.stringify({ t: "signal", payload: "k:PUBLICKEY" }));
  assert.deepEqual(await b.next(), { t: "signal", payload: "k:PUBLICKEY" });

  const sealed = Uint8Array.from([0, 1, 2, 250, 251, 255]);
  b.send(sealed);
  assert.deepEqual(await a.next(), sealed);

  a.close();
  b.close();
});

test("a third device is refused rather than displacing either of the two", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = client(port);
  const b = client(port);
  await Promise.all([a.ready, b.ready]);
  a.send(JSON.stringify({ t: "join", room: ROOM }));
  await a.next();
  b.send(JSON.stringify({ t: "join", room: ROOM }));
  await b.next();
  await a.next();

  const c = client(port);
  await c.ready;
  c.send(JSON.stringify({ t: "join", room: ROOM }));
  const refusal = await c.next();
  assert.equal(refusal.t, "error");
  assert.equal(refusal.code, "room_full");

  // The pair is undisturbed: they can still talk.
  a.send(JSON.stringify({ t: "signal", payload: "still here" }));
  assert.deepEqual(await b.next(), { t: "signal", payload: "still here" });

  a.close();
  b.close();
  c.close();
});

test("the remaining device is told when its peer goes away", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = client(port);
  const b = client(port);
  await Promise.all([a.ready, b.ready]);
  a.send(JSON.stringify({ t: "join", room: ROOM }));
  await a.next();
  b.send(JSON.stringify({ t: "join", room: ROOM }));
  await b.next();
  await a.next();

  b.close();
  assert.deepEqual(await a.next(), { t: "peer", state: "left" });

  a.close();
});

test("malformed control frames are rejected without dropping the connection", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = client(port);
  await a.ready;

  a.send("this is not json");
  assert.equal((await a.next()).code, "bad_json");

  a.send(JSON.stringify({ t: "join", room: "short" }));
  assert.equal((await a.next()).code, "bad_room");

  a.send(JSON.stringify({ t: "nonsense" }));
  assert.equal((await a.next()).code, "unknown");

  // Still usable after all of that.
  a.send(JSON.stringify({ t: "join", room: ROOM }));
  assert.equal((await a.next()).t, "joined");

  a.close();
});

test("a device cannot occupy two rooms on one connection", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());

  const a = client(port);
  await a.ready;
  a.send(JSON.stringify({ t: "join", room: ROOM }));
  await a.next();
  a.send(JSON.stringify({ t: "join", room: "ccccccccccccccccdddddd" }));
  assert.equal((await a.next()).code, "already_joined");

  a.close();
});
