/**
 * Ferry — application protocol.
 *
 * Every frame below is encrypted before it touches the wire, so neither the
 * relay nor anything between the two devices sees these bytes in the clear.
 *
 * Frame layout:  [1 byte kind][payload]
 *   HELLO  – JSON, exchanged once a channel opens so each side can label the
 *            other device in the UI.
 *   META   – JSON, announces an incoming item and how many chunks to expect.
 *   CHUNK  – [4-byte big-endian sequence][raw bytes]
 *   END    – JSON, closes an item.
 *   ACK    – JSON, receiver confirms an item landed intact.
 *   CANCEL – JSON, sender abandoned an item.
 *   PING / PONG – liveness and round-trip measurement.
 */

export const FRAME = {
  HELLO: 0x01,
  META: 0x02,
  CHUNK: 0x03,
  END: 0x04,
  ACK: 0x05,
  CANCEL: 0x06,
  PING: 0x07,
  PONG: 0x08,
} as const;

export type ItemKind = "password" | "text" | "file";

export interface HelloPayload {
  device: string;
  version: number;
}

export interface MetaPayload {
  id: string;
  kind: ItemKind;
  name?: string;
  mime?: string;
  size: number;
  chunks: number;
}

export interface AckPayload {
  id: string;
  bytes: number;
}

export interface PingPayload {
  at: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeJsonFrame(kind: number, value: unknown): Uint8Array {
  const body = encoder.encode(JSON.stringify(value));
  const frame = new Uint8Array(1 + body.length);
  frame[0] = kind;
  frame.set(body, 1);
  return frame;
}

export function encodeChunkFrame(sequence: number, data: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + data.byteLength);
  frame[0] = FRAME.CHUNK;
  new DataView(frame.buffer).setUint32(1, sequence, false);
  frame.set(data, 5);
  return frame;
}

export type DecodedFrame =
  | { chunk: true; kind: typeof FRAME.CHUNK; sequence: number; data: Uint8Array }
  | { chunk: false; kind: number; value: unknown };

export function decodeFrame(frame: Uint8Array): DecodedFrame {
  const kind = frame[0];
  if (kind === FRAME.CHUNK) {
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    return { chunk: true, kind, sequence: view.getUint32(1, false), data: frame.subarray(5) };
  }
  return { chunk: false, kind, value: JSON.parse(decoder.decode(frame.subarray(1))) };
}

export function newItemId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
