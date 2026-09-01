/**
 * Ferry — session orchestrator.
 *
 * Owns the whole lifecycle: mint or accept a PIN, meet the other device at the
 * relay, agree on keys, bring up a transport, then move items across it.
 * React only ever reads the immutable snapshot this class publishes.
 */

import {
  deriveSessionKeys,
  exportPublicKey,
  generateEphemeralKeyPair,
  generatePin,
  normalizePin,
  openJson,
  roomIdFromPin,
  type Role,
  type SessionKeys,
} from "./crypto";
import { describeThisDevice, getRelayUrl, isValidRelayUrl } from "./config";
import {
  decodeFrame,
  encodeChunkFrame,
  encodeJsonFrame,
  FRAME,
  newItemId,
  type AckPayload,
  type HelloPayload,
  type ItemKind,
  type MetaPayload,
  type PingPayload,
} from "./protocol";
import { SignalingClient, type SignalingStatus } from "./signaling";
import { Transport, type TransportMode } from "./transport";

export type Phase =
  | "idle"
  | "connecting"
  | "waiting"
  | "verifying"
  | "ready"
  | "ended"
  | "error";

export interface OutgoingItem {
  id: string;
  kind: ItemKind;
  name?: string;
  size: number;
  sent: number;
  state: "sending" | "delivered" | "failed";
  createdAt: number;
}

export interface IncomingItem {
  id: string;
  kind: ItemKind;
  name?: string;
  mime?: string;
  size: number;
  received: number;
  state: "receiving" | "complete";
  text?: string;
  blob?: Blob;
  createdAt: number;
  expiresAt: number | null;
}

export interface SessionState {
  phase: Phase;
  role: Role | null;
  pin: string;
  relayStatus: SignalingStatus;
  relayUrl: string;
  transportMode: TransportMode;
  safetyWords: string[];
  verified: boolean;
  peerPresent: boolean;
  peerName: string | null;
  roundTripMs: number | null;
  error: string | null;
  outgoing: OutgoingItem[];
  incoming: IncomingItem[];
}

/** How long a received item stays on screen before it clears itself. */
const LIFETIME_MS: Record<ItemKind, number> = {
  password: 120_000,
  text: 300_000,
  file: 900_000,
};

const MAX_FILE_BYTES = 250 * 1024 * 1024;
const PROTOCOL_VERSION = 1;

const initialState: SessionState = {
  phase: "idle",
  role: null,
  pin: "",
  relayStatus: "idle",
  relayUrl: "",
  transportMode: "connecting",
  safetyWords: [],
  verified: false,
  peerPresent: false,
  peerName: null,
  roundTripMs: null,
  error: null,
  outgoing: [],
  incoming: [],
};

interface Assembly {
  meta: MetaPayload;
  parts: Uint8Array[];
  received: number;
}

export class Session {
  private state: SessionState = initialState;
  private listeners = new Set<(state: SessionState) => void>();

  private signaling: SignalingClient | null = null;
  private transport: Transport | null = null;
  private keyPair: CryptoKeyPair | null = null;
  private keys: SessionKeys | null = null;
  private keySent = false;
  private helloSent = false;
  private assemblies = new Map<string, Assembly>();
  private sendChain: Promise<void> = Promise.resolve();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /* -------------------------------------------------------------- */
  /* Subscription                                                    */
  /* -------------------------------------------------------------- */

  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState = (): SessionState => this.state;

  private patch(changes: Partial<SessionState>): void {
    this.state = { ...this.state, ...changes };
    for (const listener of this.listeners) listener(this.state);
  }

  /* -------------------------------------------------------------- */
  /* Lifecycle                                                       */
  /* -------------------------------------------------------------- */

  /** Mint a fresh PIN and wait at the relay for the other device. */
  async host(): Promise<void> {
    await this.begin(generatePin());
  }

  /** Walk up to a session someone else opened. */
  async join(rawPin: string): Promise<void> {
    const pin = normalizePin(rawPin);
    if (pin.length !== 10) {
      this.patch({ phase: "error", error: "That code is not ten characters long." });
      return;
    }
    await this.begin(pin);
  }

  private async begin(pin: string): Promise<void> {
    const relayUrl = getRelayUrl();
    if (!isValidRelayUrl(relayUrl)) {
      this.patch({
        phase: "error",
        relayUrl,
        error:
          "No relay is configured. Open Settings and point Ferry at a relay, or run it on your own network.",
      });
      return;
    }

    this.teardown();
    this.state = { ...initialState, pin, relayUrl, phase: "connecting" };
    this.emitCurrent();

    this.keyPair = await generateEphemeralKeyPair();
    const roomId = await roomIdFromPin(pin);

    this.signaling = new SignalingClient(relayUrl, roomId, {
      onStatus: (relayStatus, detail) => {
        this.patch({ relayStatus });
        if (relayStatus === "failed") {
          this.patch({
            phase: "error",
            error: detail ?? "Could not reach the relay.",
          });
        }
      },
      onMessage: (message) => void this.handleControl(message),
      onRelayData: (data) => this.transport?.ingestRelay(data),
    });

    this.signaling.connect();
  }

  private emitCurrent(): void {
    for (const listener of this.listeners) listener(this.state);
  }

  private async handleControl(
    message: Parameters<
      NonNullable<ConstructorParameters<typeof SignalingClient>[2]["onMessage"]>
    >[0],
  ): Promise<void> {
    if (message.t === "error") {
      this.patch({
        phase: "error",
        error:
          message.code === "room_full"
            ? "Two devices are already using that code. Start a new session."
            : message.message,
      });
      return;
    }

    if (message.t === "joined") {
      this.patch({
        role: message.role,
        phase: message.occupants >= 2 ? "connecting" : "waiting",
        peerPresent: message.occupants >= 2,
      });
      if (message.occupants >= 2) await this.offerKey();
      return;
    }

    if (message.t === "peer") {
      if (message.state === "joined") {
        this.patch({ peerPresent: true, phase: "connecting" });
        await this.offerKey();
      } else {
        this.patch({
          peerPresent: false,
          error: "The other device left.",
          phase: "ended",
        });
        this.transport?.close();
      }
      return;
    }

    if (message.t === "signal") await this.handleSignal(message.payload);
  }

  private async offerKey(): Promise<void> {
    if (this.keySent || !this.keyPair || !this.signaling) return;
    this.keySent = true;
    this.signaling.sendSignal(`k:${await exportPublicKey(this.keyPair)}`);
  }

  private async handleSignal(payload: string): Promise<void> {
    if (payload.startsWith("k:")) {
      if (this.keys || !this.keyPair || !this.state.role) return;
      // Make sure our own key is on its way before we finish the handshake.
      await this.offerKey();
      try {
        this.keys = await deriveSessionKeys(
          this.state.pin,
          this.keyPair,
          payload.slice(2),
          this.state.role,
        );
      } catch {
        this.patch({
          phase: "error",
          error: "Key agreement failed. Start a new session.",
        });
        return;
      }
      this.patch({ phase: "verifying", safetyWords: this.keys.safetyWords });
      await this.startTransport();
      return;
    }

    if (!payload.startsWith("e:") || !this.keys) return;
    try {
      const decoded = await openJson<Parameters<Transport["handleSignal"]>[0]>(
        this.keys.inbound,
        payload.slice(2),
      );
      await this.transport?.handleSignal(decoded);
    } catch {
      /* A payload we cannot open did not come from our peer. Ignore it. */
    }
  }

  private async startTransport(): Promise<void> {
    if (!this.keys || !this.signaling || !this.state.role || this.transport) return;

    this.transport = new Transport(this.state.role, this.signaling, this.keys, {
      onMode: (transportMode) => this.patch({ transportMode }),
      onFrame: (frame) => this.handleFrame(frame),
      onReady: () => {
        void this.sendHello();
        this.startHeartbeat();
        if (this.state.verified) this.patch({ phase: "ready" });
      },
      onClosed: (reason) => this.patch({ phase: "error", error: reason }),
    });

    await this.transport.start();
  }

  /** The user confirmed the safety words match on both screens. */
  confirmSafetyWords(): void {
    this.patch({ verified: true });
    if (this.transport?.currentMode !== "connecting") this.patch({ phase: "ready" });
  }

  private async sendHello(): Promise<void> {
    if (this.helloSent) return;
    this.helloSent = true;
    const payload: HelloPayload = {
      device: describeThisDevice(),
      version: PROTOCOL_VERSION,
    };
    await this.transport?.send(encodeJsonFrame(FRAME.HELLO, payload));
  }

  private startHeartbeat(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      void this.transport?.send(
        encodeJsonFrame(FRAME.PING, { at: Date.now() } satisfies PingPayload),
      );
    }, 5_000);
  }

  /* -------------------------------------------------------------- */
  /* Sending                                                         */
  /* -------------------------------------------------------------- */

  sendText(kind: "text" | "password", value: string): string | null {
    if (!value) return null;
    const bytes = new TextEncoder().encode(value);
    return this.enqueue({ kind, bytes, size: bytes.byteLength });
  }

  sendFile(file: File): string | null {
    if (file.size > MAX_FILE_BYTES) {
      this.patch({
        error: `${file.name} is larger than the 250 MB limit for a single transfer.`,
      });
      return null;
    }
    return this.enqueue({
      kind: "file",
      file,
      size: file.size,
      name: file.name,
      mime: file.type || "application/octet-stream",
    });
  }

  private enqueue(input: {
    kind: ItemKind;
    bytes?: Uint8Array;
    file?: File;
    size: number;
    name?: string;
    mime?: string;
  }): string | null {
    const transport = this.transport;
    if (!transport || this.state.phase !== "ready") return null;

    const id = newItemId();
    const item: OutgoingItem = {
      id,
      kind: input.kind,
      name: input.name,
      size: input.size,
      sent: 0,
      state: "sending",
      createdAt: Date.now(),
    };
    this.patch({ outgoing: [item, ...this.state.outgoing].slice(0, 40) });

    this.sendChain = this.sendChain
      .then(() => this.transmit(transport, id, input))
      .catch(() => this.updateOutgoing(id, { state: "failed" }));

    return id;
  }

  private async transmit(
    transport: Transport,
    id: string,
    input: {
      kind: ItemKind;
      bytes?: Uint8Array;
      file?: File;
      size: number;
      name?: string;
      mime?: string;
    },
  ): Promise<void> {
    const chunkSize = transport.chunkSize;
    const chunks = Math.max(1, Math.ceil(input.size / chunkSize));

    const meta: MetaPayload = {
      id,
      kind: input.kind,
      name: input.name,
      mime: input.mime,
      size: input.size,
      chunks,
    };
    await transport.send(encodeJsonFrame(FRAME.META, meta));

    let sequence = 0;
    let sent = 0;

    const push = async (slice: Uint8Array) => {
      await transport.send(encodeChunkFrame(sequence, slice));
      sequence += 1;
      sent += slice.byteLength;
      this.updateOutgoing(id, { sent });
      await transport.waitForDrain();
    };

    if (input.bytes) {
      for (let offset = 0; offset < input.bytes.byteLength; offset += chunkSize) {
        await push(input.bytes.subarray(offset, offset + chunkSize));
      }
      if (input.bytes.byteLength === 0) await push(new Uint8Array(0));
    } else if (input.file) {
      const stream = input.file.stream().getReader();
      let carry = new Uint8Array(0);
      for (;;) {
        const { done, value } = await stream.read();
        if (done) break;
        const merged = new Uint8Array(carry.byteLength + value.byteLength);
        merged.set(carry, 0);
        merged.set(value, carry.byteLength);
        carry = merged;
        while (carry.byteLength >= chunkSize) {
          await push(carry.subarray(0, chunkSize));
          carry = carry.subarray(chunkSize);
        }
      }
      if (carry.byteLength > 0) await push(carry);
    }

    await transport.send(encodeJsonFrame(FRAME.END, { id }));
  }

  private updateOutgoing(id: string, changes: Partial<OutgoingItem>): void {
    this.patch({
      outgoing: this.state.outgoing.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    });
  }

  /* -------------------------------------------------------------- */
  /* Receiving                                                       */
  /* -------------------------------------------------------------- */

  private handleFrame(frame: Uint8Array): void {
    const decoded = decodeFrame(frame);

    if (decoded.chunk) {
      const assembly = this.currentAssembly();
      if (!assembly) return;
      assembly.parts.push(new Uint8Array(decoded.data));
      assembly.received += decoded.data.byteLength;
      this.updateIncoming(assembly.meta.id, { received: assembly.received });
      return;
    }

    switch (decoded.kind) {
      case FRAME.HELLO: {
        const hello = decoded.value as HelloPayload;
        this.patch({ peerName: hello.device });
        return;
      }
      case FRAME.META: {
        const meta = decoded.value as MetaPayload;
        this.assemblies.set(meta.id, { meta, parts: [], received: 0 });
        this.openIncoming = meta.id;
        const item: IncomingItem = {
          id: meta.id,
          kind: meta.kind,
          name: meta.name,
          mime: meta.mime,
          size: meta.size,
          received: 0,
          state: "receiving",
          createdAt: Date.now(),
          expiresAt: null,
        };
        this.patch({ incoming: [item, ...this.state.incoming].slice(0, 40) });
        return;
      }
      case FRAME.END: {
        const { id } = decoded.value as { id: string };
        void this.finalize(id);
        return;
      }
      case FRAME.ACK: {
        const ack = decoded.value as AckPayload;
        this.updateOutgoing(ack.id, { state: "delivered", sent: ack.bytes });
        return;
      }
      case FRAME.PING: {
        const ping = decoded.value as PingPayload;
        void this.transport?.send(encodeJsonFrame(FRAME.PONG, ping));
        return;
      }
      case FRAME.PONG: {
        const pong = decoded.value as PingPayload;
        this.patch({ roundTripMs: Math.max(0, Date.now() - pong.at) });
        return;
      }
      default:
    }
  }

  private openIncoming: string | null = null;

  private currentAssembly(): Assembly | undefined {
    return this.openIncoming ? this.assemblies.get(this.openIncoming) : undefined;
  }

  private async finalize(id: string): Promise<void> {
    const assembly = this.assemblies.get(id);
    if (!assembly) return;
    this.assemblies.delete(id);
    if (this.openIncoming === id) this.openIncoming = null;

    const { meta, parts, received } = assembly;
    const changes: Partial<IncomingItem> = {
      state: "complete",
      received,
      expiresAt: Date.now() + LIFETIME_MS[meta.kind],
    };

    if (meta.kind === "file") {
      changes.blob = new Blob(parts as BlobPart[], {
        type: meta.mime || "application/octet-stream",
      });
    } else {
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const part of parts) {
        merged.set(part, offset);
        offset += part.byteLength;
      }
      changes.text = new TextDecoder().decode(merged);
    }

    this.updateIncoming(id, changes);
    await this.transport?.send(
      encodeJsonFrame(FRAME.ACK, { id, bytes: received } satisfies AckPayload),
    );
  }

  private updateIncoming(id: string, changes: Partial<IncomingItem>): void {
    this.patch({
      incoming: this.state.incoming.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    });
  }

  /* -------------------------------------------------------------- */
  /* Received-item controls                                          */
  /* -------------------------------------------------------------- */

  clearIncoming(id: string): void {
    this.patch({ incoming: this.state.incoming.filter((item) => item.id !== id) });
  }

  clearAllIncoming(): void {
    this.patch({ incoming: [] });
  }

  extendIncoming(id: string, extraMs = 120_000): void {
    this.updateIncoming(id, {
      expiresAt: Math.max(Date.now(), this.expiryOf(id)) + extraMs,
    });
  }

  keepIncoming(id: string): void {
    this.updateIncoming(id, { expiresAt: null });
  }

  private expiryOf(id: string): number {
    return this.state.incoming.find((item) => item.id === id)?.expiresAt ?? Date.now();
  }

  /** Drop anything whose timer has run out. Driven by a ticker in the UI. */
  sweepExpired(now = Date.now()): void {
    const survivors = this.state.incoming.filter(
      (item) => item.expiresAt === null || item.expiresAt > now,
    );
    if (survivors.length !== this.state.incoming.length) {
      this.patch({ incoming: survivors });
    }
  }

  dismissError(): void {
    if (this.state.phase !== "error") this.patch({ error: null });
  }

  /* -------------------------------------------------------------- */
  /* Teardown                                                        */
  /* -------------------------------------------------------------- */

  end(): void {
    this.teardown();
    this.state = { ...initialState, phase: "ended" };
    this.emitCurrent();
  }

  reset(): void {
    this.teardown();
    this.state = initialState;
    this.emitCurrent();
  }

  private teardown(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.transport?.close();
    this.transport = null;
    this.signaling?.close();
    this.signaling = null;
    this.keyPair = null;
    this.keys = null;
    this.keySent = false;
    this.helloSent = false;
    this.openIncoming = null;
    this.assemblies.clear();
    this.sendChain = Promise.resolve();
  }
}
