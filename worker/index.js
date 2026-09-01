/**
 * Ferry relay — Cloudflare Workers edition.
 *
 * Speaks exactly the protocol in `server/relay.js`, so the front end cannot
 * tell the two apart. The reason to prefer this one is that it does not sleep:
 * a free Render or Fly instance spins down when idle and the first pairing of
 * the day waits half a minute for it, where a Worker answers immediately.
 *
 * Why a Durable Object: a Worker is stateless and each request may land on a
 * different machine, so two browsers holding the same code would never meet.
 * A Durable Object is a single addressable instance — one per room id — and
 * both sockets are routed to it wherever in the world they connect from.
 *
 * The room id travels as a query parameter as well as in the `join` message,
 * because the routing decision has to be made during the upgrade, before any
 * message exists to read it from. That tells the relay operator nothing new:
 * the room id is a truncated SHA-256 of the PIN, the relay was always going to
 * learn it, and it cannot be inverted to recover the PIN.
 */

const ROOM_ID = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_CONTROL_BYTES = 128 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;

/**
 * Caps how often one room will hand out a slot. This lives in memory, so it
 * resets when the object is evicted — which is after a spell of *inactivity*,
 * exactly when nobody is hammering it. Someone hammering keeps the object
 * alive and so keeps hitting the cap. It is a guard against grabbing a freed
 * slot, not a substitute for the 50 bits of entropy in the PIN.
 */
const JOIN_ATTEMPTS_PER_ROOM = 30;

function send(socket, message) {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    /* The socket has already gone away. */
  }
}

function fail(socket, code, message) {
  send(socket, { t: "error", code, message });
}

function attachmentOf(socket) {
  try {
    return socket.deserializeAttachment() ?? {};
  } catch {
    return {};
  }
}

function attach(socket, value) {
  try {
    socket.serializeAttachment(value);
  } catch {
    /* Closing sockets refuse writes; nothing depends on this succeeding. */
  }
}

/** One instance per room id. Holds at most two devices, and forwards. */
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.joinAttempts = 0;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const room = new URL(request.url).searchParams.get("room") ?? "";
    const [client, server] = Object.values(new WebSocketPair());

    // The hibernation API rather than `server.accept()`: while WebRTC carries
    // the data the sockets sit idle for minutes, and hibernating pairs cost
    // nothing instead of pinning the object in memory the whole time.
    this.state.acceptWebSocket(server);
    attach(server, { room, joined: false });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sockets that have completed a join. A connected socket is not yet one. */
  occupants() {
    return this.state
      .getWebSockets()
      .filter((socket) => attachmentOf(socket).joined);
  }

  webSocketMessage(socket, message) {
    const state = attachmentOf(socket);

    if (typeof message !== "string") {
      if (!state.joined) return;
      if (message.byteLength > MAX_FRAME_BYTES) {
        return fail(socket, "too_large", "That frame is too large.");
      }
      return this.forward(socket, message);
    }

    if (message.length > MAX_CONTROL_BYTES) {
      return fail(socket, "too_large", "That control frame is too large.");
    }

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return fail(socket, "bad_json", "Control frames must be JSON.");
    }

    switch (parsed?.t) {
      case "join":
        return this.join(socket, state, String(parsed.room ?? ""));
      case "signal":
        if (!state.joined) return;
        return this.forward(
          socket,
          JSON.stringify({ t: "signal", payload: parsed.payload }),
        );
      case "leave":
        return this.leave(socket);
      default:
        return fail(socket, "unknown", "Unrecognised control frame.");
    }
  }

  join(socket, state, room) {
    if (state.joined) {
      return fail(socket, "already_joined", "This connection already has a room.");
    }
    if (!ROOM_ID.test(room)) {
      return fail(socket, "bad_room", "That room id is not valid.");
    }
    // This object *is* one room. A join naming a different one arrived on the
    // wrong socket and must not be honoured.
    if (state.room && room !== state.room) {
      return fail(socket, "bad_room", "That room id is not valid.");
    }

    this.joinAttempts += 1;
    if (this.joinAttempts > JOIN_ATTEMPTS_PER_ROOM) {
      return fail(
        socket,
        "rate_limited",
        "Too many attempts. Wait a minute and try again.",
      );
    }

    const others = this.occupants();
    if (others.length >= 2) {
      return fail(
        socket,
        "room_full",
        "Two devices are already paired with that code.",
      );
    }

    const role = others.length === 0 ? "initiator" : "joiner";
    attach(socket, { ...state, room, joined: true });

    send(socket, { t: "joined", role, occupants: others.length + 1 });
    if (others.length === 1) {
      for (const peer of others) send(peer, { t: "peer", state: "joined" });
    }
  }

  /** Hand a payload to the other device, whatever it is, unexamined. */
  forward(socket, payload) {
    for (const peer of this.occupants()) {
      if (peer === socket) continue;
      try {
        peer.send(payload);
      } catch {
        /* The peer has already gone away. */
      }
    }
  }

  leave(socket) {
    const state = attachmentOf(socket);
    if (!state.joined) return;
    attach(socket, { ...state, joined: false });
    for (const peer of this.occupants()) send(peer, { t: "peer", state: "left" });
  }

  webSocketClose(socket) {
    this.leave(socket);
  }

  webSocketError(socket) {
    this.leave(socket);
  }
}

const relay = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname !== "/ws") {
      return new Response("Ferry relay. Connect a WebSocket to /ws.\n", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const room = url.searchParams.get("room") ?? "";
    if (!ROOM_ID.test(room)) {
      return new Response("That room id is not valid.\n", {
        status: 400,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Both devices holding the same code derive the same room id, so they
    // resolve to the same object and meet there.
    const id = env.FERRY_ROOM.idFromName(room);
    return env.FERRY_ROOM.get(id).fetch(request);
  },
};

export default relay;
