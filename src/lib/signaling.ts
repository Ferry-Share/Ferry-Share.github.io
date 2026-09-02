/**
 * Ferry — relay client.
 *
 * The relay does two jobs and knows nothing else: it introduces two browsers
 * that present the same room id, and it forwards opaque blobs between them
 * when a direct peer-to-peer link cannot be established.
 */

export type PeerState = "joined" | "left";

export type InboundMessage =
  | { t: "joined"; role: "initiator" | "joiner"; occupants: number }
  | { t: "peer"; state: PeerState }
  | { t: "signal"; payload: string }
  | { t: "error"; code: string; message: string };

export type SignalingStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "failed";

interface SignalingHandlers {
  onMessage: (message: InboundMessage) => void;
  onRelayData: (data: Uint8Array) => void;
  onStatus: (status: SignalingStatus, detail?: string) => void;
}

const MAX_BACKOFF_MS = 8_000;

export class SignalingClient {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: (string | ArrayBufferView)[] = [];

  constructor(
    private readonly url: string,
    private readonly roomId: string,
    private readonly handlers: SignalingHandlers,
  ) {}

  /**
   * Open the socket, or start over after it gave up.
   *
   * The attempt counter is cleared here so that a caller asking to reconnect
   * gets a fresh budget of retries. Without that, a client that had already
   * exhausted its backoff would fail again on the first try, for ever.
   */
  connect(): void {
    this.closedByUser = false;
    this.attempts = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) return;
    this.openSocket();
  }

  /**
   * The room id also rides in the query string. A relay that has to pick a
   * backend before the first message can be read — a Cloudflare Worker
   * choosing a Durable Object, say — needs it during the upgrade. The Node
   * relay ignores the parameter and reads the `join` message as before.
   *
   * This tells the relay nothing it was not about to learn: the room id is a
   * truncated SHA-256 of the PIN and cannot be inverted to recover it.
   */
  private endpoint(): string {
    try {
      const url = new URL(this.url);
      url.searchParams.set("room", this.roomId);
      return url.toString();
    } catch {
      return this.url;
    }
  }

  private openSocket(): void {
    this.handlers.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.endpoint());
    } catch {
      this.scheduleReconnect("That relay address could not be opened");
      return;
    }

    socket.binaryType = "arraybuffer";
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      socket.send(JSON.stringify({ t: "join", room: this.roomId }));
      this.handlers.onStatus("open");
      for (const pending of this.queue.splice(0)) socket.send(pending as never);
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          this.handlers.onMessage(JSON.parse(event.data) as InboundMessage);
        } catch {
          /* A malformed control frame is ignored rather than killing the session. */
        }
        return;
      }
      this.handlers.onRelayData(new Uint8Array(event.data as ArrayBuffer));
    };

    socket.onerror = () => {
      /* onclose always follows; recovery is handled there. */
    };

    socket.onclose = (event) => {
      this.socket = null;
      if (this.closedByUser) {
        this.handlers.onStatus("closed");
        return;
      }
      this.scheduleReconnect(
        event.reason || "The relay connection dropped",
      );
    };
  }

  private scheduleReconnect(detail: string): void {
    this.attempts += 1;
    if (this.attempts > 6) {
      this.handlers.onStatus("failed", detail);
      return;
    }
    const delay = Math.min(MAX_BACKOFF_MS, 400 * 2 ** (this.attempts - 1));
    this.handlers.onStatus("reconnecting", detail);
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  /** Send an encrypted signaling payload to the other device. */
  sendSignal(payload: string): void {
    this.dispatch(JSON.stringify({ t: "signal", payload }));
  }

  /** Fallback transport: forward an encrypted data frame through the relay. */
  sendRelayData(data: Uint8Array): void {
    this.dispatch(data);
  }

  private dispatch(message: string | Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(message as never);
      return;
    }
    if (this.queue.length < 64) this.queue.push(message);
  }

  get bufferedAmount(): number {
    return this.socket?.bufferedAmount ?? 0;
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify({ t: "leave" }));
      } catch {
        /* Already gone. */
      }
    }
    this.socket?.close(1000, "session ended");
    this.socket = null;
  }
}
