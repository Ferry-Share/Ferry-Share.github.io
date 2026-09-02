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
  PIN_LENGTH,
  openJson,
  roomIdFromPin,
  type Role,
  type SessionKeys,
} from "./crypto";
import { describeThisDevice, getRelayUrl, isValidRelayUrl } from "./config";
import { isRemembering, remember, setRemembering } from "./reunion";
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

export type OutgoingState =
  | "queued"
  | "sending"
  | "delivered"
  | "failed"
  | "cancelled";

export interface OutgoingItem {
  id: string;
  kind: ItemKind;
  name?: string;
  size: number;
  sent: number;
  state: OutgoingState;
  /** 1 for the next item to go, 2 for the one behind it, 0 when not waiting. */
  place: number;
  /** Whether the payload is still held, so this row can be sent again. */
  retryable: boolean;
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
  /**
   * A link that dropped and is being rebuilt from the code already in memory.
   * Distinct from `error`: nothing has gone wrong that the user must act on.
   */
  reconnecting: boolean;
  notice: string | null;
  /** True once this pairing has been stored under Settings → remembered devices. */
  remembered: boolean;
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

/**
 * How many items may wait to go at once.
 *
 * Generous enough to drop a folder on the page, bounded so a stray
 * multi-thousand-file selection cannot fill memory with File handles or bury
 * the list it is meant to show.
 */
export const MAX_QUEUED_ITEMS = 50;

/**
 * How many items transfer at the same time — one, deliberately.
 *
 * Two reasons, and the first is a hard one. A CHUNK frame carries a sequence
 * number and nothing else, and the receiver routes it to whichever item is
 * currently open, so two files on the wire at once would interleave into each
 * other. Sending in parallel needs a file id in the frame header, which is a
 * protocol change.
 *
 * The second reason is that it would not help. Both files would share one
 * ordered SCTP stream and the same finite link, so parallelism does not make
 * the set arrive sooner — it only makes the first file arrive later. Sending
 * one at a time means every completed file is genuinely finished, and a link
 * that drops costs the one in flight rather than all of them.
 */
export const MAX_PARALLEL_TRANSFERS = 1;

/** Finished rows are trimmed to this many; waiting ones are never dropped. */
const OUTGOING_HISTORY = 60;

/**
 * How many times a dropped link is rebuilt before Ferry stops and says so.
 *
 * The relay client already retries the socket with backoff underneath this,
 * so each of these is a whole handshake attempt, not a packet.
 */
const MAX_RELINKS = 8;

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
  reconnecting: false,
  notice: null,
  remembered: false,
  outgoing: [],
  incoming: [],
};

/** What a queued item will send once its turn comes. */
type PendingPayload =
  | { kind: "text" | "password"; bytes: Uint8Array }
  | { kind: "file"; file: File; name: string; mime: string };

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
  private transportReady = false;
  private assemblies = new Map<string, Assembly>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /* The send queue. `pending` holds the payloads, `queue` the order they go
     in, and `active` whichever one is on the wire. A payload is kept until
     the item is delivered, so a failed or cancelled row can be sent again. */
  private pending = new Map<string, PendingPayload>();
  private queue: string[] = [];
  private active: string | null = null;
  private pumping = false;
  private cancelling = new Set<string>();

  /** Set when the user ends the session, so a close is not mistaken for a drop. */
  private intentionalEnd = false;
  private relinks = 0;

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
    if (pin.length !== PIN_LENGTH) {
      this.patch({
        phase: "error",
        error: `That code is not ${PIN_LENGTH} characters long.`,
      });
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
    this.intentionalEnd = false;
    this.relinks = 0;
    this.state = { ...initialState, pin, relayUrl, phase: "connecting" };
    this.emitCurrent();

    this.keyPair = await generateEphemeralKeyPair();
    const roomId = await roomIdFromPin(pin);

    this.signaling = new SignalingClient(relayUrl, roomId, {
      onStatus: (relayStatus, detail) => {
        this.patch({ relayStatus });
        if (relayStatus !== "failed") return;

        // The relay client has spent its own backoff. If a pairing already
        // exists, this is a drop to recover from rather than a dead end —
        // relink counts the attempts and gives up loudly when it should.
        if (this.state.verified && !this.intentionalEnd) {
          void this.relink(detail ?? "Lost the relay");
          return;
        }
        this.patch({
          phase: "error",
          reconnecting: false,
          error: detail ?? "Could not reach the relay.",
        });
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
        // The code is still in memory and the relay socket is still open, so
        // there is nothing to scan again: drop back to waiting, and the
        // handshake runs itself the moment they reappear.
        await this.resetHandshake();
        this.patch({
          peerPresent: false,
          phase: "waiting",
          reconnecting: true,
          notice: "The other device dropped off. Waiting for it to come back.",
        });
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
      // On a first pairing the user checks the words. On a relink of the same
      // code they already have: the key agreement is salted with that code, so
      // the property the words attest to is unchanged, and the new words are
      // shown in the ribbon for anyone who wants to look.
      this.patch({
        phase: this.state.verified ? "connecting" : "verifying",
        safetyWords: this.keys.safetyWords,
      });
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
        this.transportReady = true;
        void this.sendHello();
        this.startHeartbeat();
        if (this.state.verified) {
          // A pairing that came back is not a pairing that keeps failing, so
          // the next drop gets a full budget of attempts again.
          this.relinks = 0;
          this.patch({ phase: "ready", reconnecting: false, notice: null });
          // Anything the drop interrupted is still at the front of the queue.
          void this.pump();
        }
      },
      onClosed: (reason, fatal) => {
        this.stopHeartbeat();
        // A frame that failed authentication is not a flaky link, and
        // retrying it would be the wrong instinct entirely.
        if (fatal || this.intentionalEnd) {
          this.patch({ phase: "error", error: reason, reconnecting: false });
          return;
        }
        void this.relink(reason);
      },
    });

    await this.transport.start();
  }

  /* -------------------------------------------------------------- */
  /* Reconnecting                                                    */
  /* -------------------------------------------------------------- */

  /**
   * Give up the current handshake and get ready to run another one, keeping
   * everything the user would hate to lose: the code, the queue, what has
   * already arrived, and the fact that they verified this pairing.
   */
  private async resetHandshake(): Promise<void> {
    this.stopHeartbeat();
    this.transport?.close();
    this.transport = null;
    this.transportReady = false;
    this.helloSent = false;
    this.keySent = false;
    this.keys = null;
    this.assemblies.clear();
    this.openIncoming = null;

    // Whatever was on the wire never finished. Put it back at the front so it
    // is the first thing to go when the link returns.
    if (this.active) {
      const id = this.active;
      this.active = null;
      if (this.pending.has(id)) {
        this.queue.unshift(id);
        this.updateOutgoing(id, { state: "queued", sent: 0 });
      }
    }

    // A fresh ephemeral pair every time, so a relink is a new handshake
    // rather than a replay of the last one.
    this.keyPair = await generateEphemeralKeyPair();
    this.patch({
      transportMode: "connecting",
      peerName: null,
      roundTripMs: null,
      safetyWords: [],
    });
    this.renumber();
  }

  /**
   * The link dropped by itself. Rebuild it from the code already in memory —
   * no QR, no retyping.
   */
  private async relink(reason: string): Promise<void> {
    if (this.intentionalEnd || !this.state.pin) return;

    this.relinks += 1;
    if (this.relinks > MAX_RELINKS) {
      this.patch({
        phase: "error",
        reconnecting: false,
        error: `${reason}. Reconnecting did not help — start a new session.`,
      });
      return;
    }

    await this.resetHandshake();
    this.patch({
      phase: "connecting",
      reconnecting: true,
      notice: "The link dropped. Reconnecting…",
    });

    // The relay socket usually outlives a dead data channel, in which case
    // the peer is still in the room and a fresh key offer is all it takes.
    if (this.state.peerPresent) {
      await this.offerKey();
      return;
    }

    // Otherwise the socket went too. Reconnecting it re-joins the same room,
    // because the room id is derived from the same code.
    this.signaling?.connect();
  }

  /** Try again now, rather than waiting for the next automatic attempt. */
  reconnectNow(): void {
    if (!this.state.pin) return;
    this.relinks = 0;
    void this.relink("Reconnecting");
  }

  /* -------------------------------------------------------------- */
  /* Remembered devices                                              */
  /* -------------------------------------------------------------- */

  /**
   * Turn remembering on or off. Turning it on stores the current pairing
   * straight away, so the toggle does what it says while the two devices are
   * still together.
   */
  setRemember(on: boolean): void {
    setRemembering(on);
    if (on) this.saveReunion();
    else this.patch({ remembered: false });
  }

  /**
   * Store the rotated reunion code for the peer, if the user asked for it.
   *
   * Needs the peer's label, which arrives in HELLO, so this is called from
   * both there and from the transition into `ready` — whichever lands last
   * is the one that writes.
   */
  private saveReunion(): void {
    if (!isRemembering() || !this.keys || !this.state.peerName) return;
    remember(this.state.peerName, this.keys.reunionPin);
    if (!this.state.remembered) this.patch({ remembered: true });
  }

  /** The user confirmed the safety words match on both screens. */
  confirmSafetyWords(): void {
    this.patch({ verified: true, notice: null });
    // Only a transport that has actually come up can carry an item. Without
    // this the session could reach "ready" with nothing to send on, and every
    // send would be dropped in silence.
    if (this.transportReady) {
      this.patch({ phase: "ready", reconnecting: false });
      this.saveReunion();
      void this.pump();
    }
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

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
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
    return this.enqueue({ kind, size: bytes.byteLength }, { kind, bytes });
  }

  /**
   * Queue one file. Kept for callers that only ever have one; `sendFiles` is
   * what the composer uses.
   */
  sendFile(file: File): string | null {
    return this.sendFiles([file]).accepted[0] ?? null;
  }

  /**
   * Queue a whole selection at once.
   *
   * Everything that can go is queued even when part of the selection cannot,
   * because silently dropping half a folder is worse than saying which half.
   */
  sendFiles(files: Iterable<File>): { accepted: string[]; rejected: string[] } {
    const accepted: string[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is over the 250 MB limit for one file`);
        continue;
      }
      if (this.waitingCount() >= MAX_QUEUED_ITEMS) {
        rejected.push(
          `${file.name} did not fit — the queue holds ${MAX_QUEUED_ITEMS} items`,
        );
        continue;
      }
      const id = this.enqueue(
        { kind: "file", size: file.size, name: file.name },
        {
          kind: "file",
          file,
          name: file.name,
          mime: file.type || "application/octet-stream",
        },
      );
      if (id) accepted.push(id);
      else rejected.push(`${file.name} could not be queued`);
    }

    if (rejected.length) this.patch({ error: rejected.join(". ") });
    return { accepted, rejected };
  }

  /** Items still waiting or on the wire. */
  private waitingCount(): number {
    return this.state.outgoing.filter(
      (item) => item.state === "queued" || item.state === "sending",
    ).length;
  }

  private enqueue(
    row: { kind: ItemKind; size: number; name?: string },
    payload: PendingPayload,
  ): string | null {
    // Unlike before, a queue may be built while the link is still coming up:
    // the pump starts as soon as the transport is ready.
    if (this.state.phase === "ended" || this.state.phase === "error") return null;

    const id = newItemId();
    const item: OutgoingItem = {
      id,
      kind: row.kind,
      name: row.name,
      size: row.size,
      sent: 0,
      state: "queued",
      place: 0,
      retryable: true,
      createdAt: Date.now(),
    };

    this.pending.set(id, payload);
    this.queue.push(id);
    this.patch({ outgoing: this.trimOutgoing([item, ...this.state.outgoing]) });
    this.renumber();
    void this.pump();
    return id;
  }

  /**
   * Waiting rows are never trimmed away — only finished ones, oldest first.
   * A queue that quietly forgot the file it still had to send would be worse
   * than a long list.
   */
  private trimOutgoing(items: OutgoingItem[]): OutgoingItem[] {
    if (items.length <= OUTGOING_HISTORY) return items;
    const live = items.filter(
      (item) => item.state === "queued" || item.state === "sending",
    );
    const done = items.filter(
      (item) => item.state !== "queued" && item.state !== "sending",
    );
    return [...live, ...done].slice(0, Math.max(OUTGOING_HISTORY, live.length));
  }

  /** Stamp each waiting row with its place in line, so the UI can say "3rd". */
  private renumber(): void {
    const place = new Map(this.queue.map((id, index) => [id, index + 1]));
    this.patch({
      outgoing: this.state.outgoing.map((item) =>
        item.state === "queued" && place.get(item.id) !== item.place
          ? { ...item, place: place.get(item.id) ?? 0 }
          : item.state !== "queued" && item.place !== 0
            ? { ...item, place: 0 }
            : item,
      ),
    });
  }

  /**
   * Send one item at a time until the queue empties.
   *
   * A link that drops mid-item does not fail it: the item goes back to the
   * front of the queue and the pump stops, so it resumes from the start of
   * that file once the devices find each other again.
   */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;

    try {
      while (this.queue.length > 0) {
        const transport = this.transport;
        if (!transport || !this.transportReady || this.state.phase !== "ready") break;

        const id = this.queue[0];
        const payload = this.pending.get(id);
        if (!payload) {
          this.queue.shift();
          continue;
        }

        if (this.cancelling.has(id)) {
          this.cancelling.delete(id);
          this.queue.shift();
          this.pending.delete(id);
          this.updateOutgoing(id, { state: "cancelled", retryable: false, place: 0 });
          this.renumber();
          continue;
        }

        this.queue.shift();
        this.active = id;
        this.updateOutgoing(id, { state: "sending", sent: 0, place: 0 });
        this.renumber();

        try {
          await this.transmit(transport, id, payload);
          this.pending.delete(id);
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : "";
          if (reason === "cancelled") {
            this.pending.delete(id);
            this.updateOutgoing(id, { state: "cancelled", retryable: false });
          } else if (this.state.phase !== "ready") {
            // The link went away under it. Put it back rather than failing it.
            this.queue.unshift(id);
            this.updateOutgoing(id, { state: "queued", sent: 0 });
          } else {
            this.updateOutgoing(id, { state: "failed" });
          }
        } finally {
          this.cancelling.delete(id);
          this.active = null;
        }

        this.renumber();
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Take an item out of the queue, or stop the one that is going. */
  cancelOutgoing(id: string): void {
    if (this.active === id) {
      this.cancelling.add(id);
      return;
    }
    const at = this.queue.indexOf(id);
    if (at === -1) return;
    this.queue.splice(at, 1);
    this.pending.delete(id);
    this.updateOutgoing(id, { state: "cancelled", retryable: false, place: 0 });
    this.renumber();
  }

  /** Put a failed or cancelled item back at the end of the queue. */
  retryOutgoing(id: string): boolean {
    const payload = this.pending.get(id);
    if (!payload || this.queue.includes(id) || this.active === id) return false;

    this.queue.push(id);
    this.updateOutgoing(id, { state: "queued", sent: 0, retryable: true });
    this.renumber();
    void this.pump();
    return true;
  }

  /** Requeue everything that failed, in the order it was added. */
  retryAllFailed(): number {
    const failed = [...this.state.outgoing]
      .reverse()
      .filter((item) => item.state === "failed" && this.pending.has(item.id));
    let requeued = 0;
    for (const item of failed) if (this.retryOutgoing(item.id)) requeued += 1;
    return requeued;
  }

  /** Drop every finished row from the list. Waiting ones stay. */
  clearOutgoingHistory(): void {
    this.patch({
      outgoing: this.state.outgoing.filter(
        (item) => item.state === "queued" || item.state === "sending",
      ),
    });
  }

  /** Empty the queue without touching whatever is already on the wire. */
  cancelQueued(): number {
    const ids = [...this.queue];
    for (const id of ids) this.cancelOutgoing(id);
    return ids.length;
  }

  private async transmit(
    transport: Transport,
    id: string,
    payload: PendingPayload,
  ): Promise<void> {
    const chunkSize = transport.chunkSize;
    const size =
      payload.kind === "file" ? payload.file.size : payload.bytes.byteLength;
    const chunks = Math.max(1, Math.ceil(size / chunkSize));

    const meta: MetaPayload = {
      id,
      kind: payload.kind,
      name: payload.kind === "file" ? payload.name : undefined,
      mime: payload.kind === "file" ? payload.mime : undefined,
      size,
      chunks,
    };
    await transport.send(encodeJsonFrame(FRAME.META, meta));

    let sequence = 0;
    let sent = 0;

    const push = async (slice: Uint8Array) => {
      // Checked per chunk so a cancel lands promptly on a large file rather
      // than after it has finished going.
      if (this.cancelling.has(id)) {
        await transport.send(encodeJsonFrame(FRAME.CANCEL, { id }));
        throw new Error("cancelled");
      }
      await transport.send(encodeChunkFrame(sequence, slice));
      sequence += 1;
      sent += slice.byteLength;
      this.updateOutgoing(id, { sent });
      await transport.waitForDrain();
    };

    if (payload.kind !== "file") {
      const bytes = payload.bytes;
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        await push(bytes.subarray(offset, offset + chunkSize));
      }
      if (bytes.byteLength === 0) await push(new Uint8Array(0));
    } else {
      const stream = payload.file.stream().getReader();
      try {
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
      } finally {
        // Releases the underlying file handle whether this finished, was
        // cancelled, or lost the link part-way through.
        stream.cancel().catch(() => {});
      }
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
        // The peer's label is what a remembered device is filed under, so
        // this is the earliest point at which it can be stored.
        this.saveReunion();
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
      case FRAME.CANCEL: {
        const { id } = decoded.value as { id: string };
        this.assemblies.delete(id);
        if (this.openIncoming === id) this.openIncoming = null;
        this.patch({
          incoming: this.state.incoming.filter((item) => item.id !== id),
        });
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
    this.intentionalEnd = true;
    this.teardown();
    this.state = { ...initialState, phase: "ended" };
    this.emitCurrent();
  }

  reset(): void {
    this.intentionalEnd = true;
    this.teardown();
    this.state = initialState;
    this.emitCurrent();
  }

  private teardown(): void {
    this.stopHeartbeat();
    this.transport?.close();
    this.transport = null;
    this.signaling?.close();
    this.signaling = null;
    this.keyPair = null;
    this.keys = null;
    this.keySent = false;
    this.helloSent = false;
    this.transportReady = false;
    this.openIncoming = null;
    this.assemblies.clear();
    this.queue = [];
    this.pending.clear();
    this.cancelling.clear();
    this.active = null;
  }
}
