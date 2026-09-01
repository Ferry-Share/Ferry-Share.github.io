# Ferry

Hand a password, a piece of text or a file from one device to another. The two
browsers talk directly wherever the network allows it, everything is encrypted
end to end, and nothing is stored anywhere afterwards.

Built with Next.js as a static export, so the whole front end runs from GitHub
Pages. The rendezvous relay lives in the same repository under `server/`.

---

## Read this first: GitHub Pages and the relay

GitHub Pages serves static files. It cannot run Node, and it cannot hold a
WebSocket open. Two browsers that have never met need *something* to introduce
them, so a pairing tool always needs one small always-on process.

Ferry keeps both halves in this one repository and gives you two ways to run
them.

**Same network — one command, no hosting at all**

```bash
npm install
npm run lan
```

One Node process serves the built front end *and* the relay. It prints your LAN
address; open it on both devices and you are done. Nothing leaves your network.

**Over the internet — Pages plus a tiny relay**

| Piece | Where it runs | What it costs |
| --- | --- | --- |
| Front end (`src/`) | GitHub Pages, via the included workflow | Free |
| Relay (`server/relay.js`) | Render, Fly.io, Railway, or your own box | Free tier is plenty |

The relay is about 200 lines. It matches two sockets on a room id and forwards
bytes. It never sees your pairing code, your keys or your data, so hosting it
somewhere else costs you nothing in privacy.

---

## How it works

```
   Device A                       Relay                        Device B
      │                       (untrusted)                          │
      │  1. mint PIN, show QR                                      │
      │  2. join room = SHA-256(PIN) ───────────────────────────►  │
      │  3. exchange ECDH public keys ◄──────────────────────────► │
      │     session key = HKDF(ECDH shared secret, salt = f(PIN))  │
      │  4. compare four safety words on both screens              │
      │                                                            │
      │  5a. WebRTC data channel ═══════════════════════════════►  │   preferred
      │  5b. or encrypted frames through the relay ─────────────►  │   fallback
```

1. **The PIN is the only secret.** Ten Crockford base-32 characters, about 50
   bits, from `crypto.getRandomValues`. It travels in a QR code or in the URL
   fragment, which browsers never send to a server. On arrival the app strips it
   out of the address bar.

2. **The relay only ever learns a hash.** The room id is
   `SHA-256("ferry/v1/room:" + PIN)`, truncated. Knowing the room id tells you
   nothing about the PIN.

3. **Key agreement is bound to the PIN.** Both sides generate an ephemeral
   ECDH P-256 key pair and derive the session key with HKDF, *salted with a
   value derived from the PIN*. Anyone who does not know the PIN — including a
   malicious relay that inserts its own peer — derives a different key, so their
   frames fail authentication instantly. Keys are ephemeral, so capturing the
   traffic and learning the PIN later still does not decrypt it.

4. **Separate keys per direction**, so a frame can never be replayed back at the
   device that sent it.

5. **Four safety words** are derived from the session key and shown on both
   screens. Matching words are a human-checkable confirmation that no one is in
   the middle.

6. **Payloads are AES-256-GCM.** Even the WebRTC offer, answer and ICE
   candidates are encrypted before they reach the relay, so your local IP
   addresses are not exposed to it either.

The relevant tests live in the repo history; the properties above were verified
against the real WebCrypto implementation: keys agree, directions are
independent, a wrong-PIN peer is rejected, and replays are rejected.

### What Ferry deliberately does not protect against

- Anyone who obtains the PIN before the second device joins can take that slot.
  Rooms hold two devices and no more, so if a stranger got in first, your own
  device is refused and you will notice. Treat the code like a door key.
- A compromised device. End-to-end encryption ends at the endpoints.
- Traffic analysis by the relay: it can see that two sockets exchanged *n* bytes,
  just not what they were.

---

## Running it

```bash
npm install

npm run dev          # front end at http://localhost:3000
npm run dev:relay    # relay at ws://localhost:8081/ws (second terminal)

npm run build        # static export into ./out
npm run lan          # build, then serve front end + relay together on your LAN
npm run typecheck
```

During `npm run dev` the app looks for a relay on its own origin. Point it at
the dev relay once via **Settings → Relay address**: `ws://localhost:8081/ws`.

> **Cameras need HTTPS.** Browsers only expose `getUserMedia` on secure origins,
> so QR scanning does not work over plain `http://192.168.x.x`. On a LAN, type
> the ten character code instead — or put the LAN host behind HTTPS.

---

## Deploying

### Front end → GitHub Pages

1. Push this repository to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main`. The included workflow builds the export and publishes it.

The workflow sets `NEXT_PUBLIC_BASE_PATH` for you: `/repo-name` for a project
site, empty for a `username.github.io` site.

### Relay → anywhere that runs Node

**Render** — New → Blueprint → pick this repo. `render.yaml` does the rest.

**Fly.io** — `fly launch --no-deploy && fly deploy`, using the included
`fly.toml`.

**Docker** — `docker build -t ferry-relay . && docker run -p 8081:8081 ferry-relay`

**Your own server** — `PORT=8081 node server/relay.js` behind nginx or Caddy
with a WebSocket upgrade on `/ws`.

Then tell the front end where it is. Either set a repository variable named
`NEXT_PUBLIC_RELAY_URL` (Settings → Secrets and variables → Actions →
Variables) to something like `wss://ferry-relay.onrender.com/ws`, or let each
person enter it once under Settings — it is remembered in their browser.

> Free Render and Fly instances sleep when idle. The first pairing of the day
> may take a few seconds to wake the relay.

### Optional: TURN

A small number of networks (symmetric NAT, some corporate Wi-Fi) block direct
peer-to-peer. Ferry notices and falls back to relaying encrypted frames, which
always works but is slower. If you would rather keep transfers peer-to-peer,
add TURN credentials under Settings.

---

## Project layout

```
src/
  app/                 Next.js app router — layout, page, global styles
  components/
    Ferry.tsx          shell, header, settings, how-it-works
    Pairing.tsx        choose a side, host with QR, join, verify safety words
    Workspace.tsx      connection ribbon, composer, received items
    Qr.tsx             QR renderer and camera scanner
    ui.tsx             buttons, toasts, sheet, icons
  hooks/useSession.ts  binds the session to React
  lib/
    crypto.ts          PIN, room derivation, ECDH + HKDF, AES-GCM, safety words
    protocol.ts        binary frame format
    signaling.ts       relay client with reconnect and backoff
    transport.ts       WebRTC data channel, relay fallback, backpressure
    session.ts         state machine, send queue, receive assembly, expiry
    config.ts          relay resolution, ICE servers, device labels
server/
  relay.js             the rendezvous relay
  lan.js               static host + relay in one process
```

## Behaviour worth knowing

- **Received items clear themselves.** Passwords after two minutes, text after
  five, files after fifteen. Each row offers *+2 min* and *Keep*.
- **Copying a password** offers a one-tap clipboard wipe afterwards.
- **Files stream** in 64 KB chunks with backpressure, so a 200 MB file does not
  blow up the tab. The cap on a single transfer is 250 MB.
- **Paste anywhere** to send a file. **Ctrl/⌘ + Enter** sends text.
- **Drag and drop** onto the file tab.
- Light and dark, keyboard focus rings throughout, and `prefers-reduced-motion`
  is respected.

## Browser support

Chrome, Edge, Firefox and Safari, on desktop and mobile. QR scanning uses
`BarcodeDetector` where available and falls back to `jsQR` elsewhere.

## Licence

MIT.
