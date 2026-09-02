/**
 * Ferry — transport.
 *
 * Preferred path is a direct WebRTC data channel: on a shared Wi-Fi network
 * the bytes never leave the building. If the network blocks peer-to-peer
 * (symmetric NAT, locked-down corporate Wi-Fi), the same encrypted frames are
 * forwarded through the relay instead. Payloads are identical either way, so
 * the relay never gains anything by being in the path.
 */

import { iceServers } from "./config";
import { open as openFrame, seal, sealJson, type SessionKeys } from "./crypto";
import type { SignalingClient } from "./signaling";

export type TransportMode = "connecting" | "direct" | "relay";

type NegotiationMessage =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };

interface TransportHandlers {
  onFrame: (frame: Uint8Array) => void;
  onMode: (mode: TransportMode) => void;
  onReady: () => void;
  /**
   * `fatal` marks a close the session must not paper over by reconnecting —
   * a frame that failed authentication rather than a link that went away.
   */
  onClosed: (reason: string, fatal?: boolean) => void;
}

/** SCTP tolerates far more, but 64 KiB is universally safe and still fast. */
const FALLBACK_CHUNK = 64 * 1024;
const BUFFER_HIGH_WATER = 4 * 1024 * 1024;
const BUFFER_LOW_WATER = 512 * 1024;
const DIRECT_CONNECT_TIMEOUT_MS = 9_000;

export class Transport {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private mode: TransportMode = "connecting";
  private ready = false;
  private disposed = false;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    private readonly role: "initiator" | "joiner",
    private readonly signaling: SignalingClient,
    private readonly keys: SessionKeys,
    private readonly handlers: TransportHandlers,
  ) {}

  async start(): Promise<void> {
    const pc = new RTCPeerConnection({
      iceServers: iceServers(),
      bundlePolicy: "max-bundle",
    });
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void this.emit({ type: "ice", candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.fallBackToRelay(true);
    };

    if (this.role === "initiator") {
      const channel = pc.createDataChannel("ferry", { ordered: true });
      this.attachChannel(channel);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.emit({ type: "offer", sdp: offer.sdp ?? "" });
    } else {
      pc.ondatachannel = (event) => this.attachChannel(event.channel);
    }

    // If peer-to-peer has not come up in time, start moving data through the
    // relay. WebRTC keeps negotiating in the background and takes over the
    // moment it succeeds.
    this.fallbackTimer = setTimeout(() => this.fallBackToRelay(), DIRECT_CONNECT_TIMEOUT_MS);
  }

  private attachChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
    this.channel = channel;

    channel.onopen = () => {
      if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
      // Only promote if we have not already committed to the relay. Switching
      // paths mid-transfer could reorder frames, so the first choice sticks.
      if (this.mode === "connecting") this.setMode("direct");
      this.markReady();
    };

    channel.onmessage = (event) => {
      void this.ingest(new Uint8Array(event.data as ArrayBuffer));
    };

    channel.onclose = () => this.fallBackToRelay(true);
    channel.onerror = () => this.fallBackToRelay(true);
  }

  /**
   * Move to the relay path. `force` is used when a direct link that was
   * already up has gone away; otherwise this only fires while still trying.
   */
  private fallBackToRelay(force = false): void {
    if (this.disposed) return;
    if (!force && this.mode !== "connecting") return;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.setMode("relay");
    this.markReady();
  }

  private setMode(mode: TransportMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.handlers.onMode(mode);
  }

  private markReady(): void {
    if (this.ready) return;
    this.ready = true;
    this.handlers.onReady();
  }

  /* -------------------------------------------------------------- */
  /* Signaling                                                       */
  /* -------------------------------------------------------------- */

  private async emit(message: NegotiationMessage): Promise<void> {
    const sealed = await sealJson(this.keys.outbound, message);
    this.signaling.sendSignal(`e:${sealed}`);
  }

  /** Called by the session once a signaling payload has been decrypted. */
  async handleSignal(message: NegotiationMessage): Promise<void> {
    const pc = this.pc;
    if (!pc) return;

    if (message.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
      await this.flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.emit({ type: "answer", sdp: answer.sdp ?? "" });
      return;
    }

    if (message.type === "answer") {
      if (pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
      await this.flushCandidates();
      return;
    }

    if (!pc.remoteDescription) {
      this.pendingCandidates.push(message.candidate);
      return;
    }
    try {
      await pc.addIceCandidate(message.candidate);
    } catch {
      /* Stale candidates are expected during renegotiation. */
    }
  }

  private async flushCandidates(): Promise<void> {
    const pending = this.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try {
        await this.pc?.addIceCandidate(candidate);
      } catch {
        /* Ignore candidates the peer connection has already outgrown. */
      }
    }
  }

  /* -------------------------------------------------------------- */
  /* Data                                                            */
  /* -------------------------------------------------------------- */

  /** Encrypt one protocol frame and put it on the fastest available path. */
  async send(frame: Uint8Array): Promise<void> {
    const sealed = await seal(this.keys.outbound, frame);
    if (this.mode !== "relay" && this.channel?.readyState === "open") {
      this.channel.send(sealed as unknown as ArrayBufferView);
      return;
    }
    this.signaling.sendRelayData(sealed);
  }

  /** Called by the session for binary blobs arriving via the relay path. */
  ingestRelay(data: Uint8Array): void {
    void this.ingest(data);
  }

  private async ingest(sealed: Uint8Array): Promise<void> {
    try {
      const frame = await openFrame(this.keys.inbound, sealed);
      this.handlers.onFrame(frame);
    } catch {
      this.handlers.onClosed(
        "A frame failed its integrity check. The session was stopped.",
        true,
      );
      this.close();
    }
  }

  /**
   * Pause until the outbound buffer drains. Without this a large file will
   * grow the send buffer until the tab runs out of memory.
   */
  async waitForDrain(): Promise<void> {
    const channel = this.mode === "relay" ? null : this.channel;
    if (channel?.readyState === "open") {
      if (channel.bufferedAmount < BUFFER_HIGH_WATER) return;
      await new Promise<void>((resolve) => {
        const done = () => {
          channel.removeEventListener("bufferedamountlow", done);
          resolve();
        };
        channel.addEventListener("bufferedamountlow", done);
        setTimeout(done, 2_000);
      });
      return;
    }

    while (this.signaling.bufferedAmount > BUFFER_HIGH_WATER && !this.disposed) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  get chunkSize(): number {
    const limit = this.pc?.sctp?.maxMessageSize;
    if (this.mode !== "relay" && this.channel?.readyState === "open" && limit) {
      // Leave headroom for the 1-byte kind, 4-byte sequence, nonce and tag.
      return Math.max(16 * 1024, Math.min(FALLBACK_CHUNK, limit - 256));
    }
    return FALLBACK_CHUNK;
  }

  get currentMode(): TransportMode {
    return this.mode;
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    try {
      this.channel?.close();
    } catch {
      /* Already closed. */
    }
    try {
      this.pc?.close();
    } catch {
      /* Already closed. */
    }
    this.channel = null;
    this.pc = null;
  }
}
