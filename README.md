# u-wsocket

A drop-in [`ws`](https://github.com/websockets/ws) replacement, one half swapped and one half not:

- **`WebSocketServer`** — reimplemented on [μWebSockets.js](https://github.com/uNetworking/uWebSockets.js) instead of Node's `http`.
- **`WebSocket`** (client) — re-exported from `ws.WebSocket` as-is.

> Initially forked from **[ultimate-ws](https://github.com/dimdenGD/ultimate-ws)**.

## Requirements

- Node.js `>=22 <23` or `>=24 <25`
- Linux on glibc — the native binding ships prebuilt as [`@jimmyolo/uws.js`](https://github.com/jimmyolo/uws.js) (AlmaLinux 9)

Pinned backends: [`ws`](https://github.com/websockets/ws) `~8.21.2`, [μWebSockets.js](https://github.com/uNetworking/uWebSockets.js) `20.69.0` (via `@jimmyolo/uws.js#v20.69.0-alma.1`).

The `ws` range stops at the minor boundary on purpose: a `ws` minor can change behaviour here without a line of this code changing. Patch releases of 8.21 come in on their own. Verdicts live in [Known Limitation](#known-limitation), tagged with the version that introduced them — **no verdict means unread, not compatible.**

## Install

```bash
npm install github:jimmyolo/uwsocket#v2.4.1
```

```json
{
  "dependencies": {
    "@jimmyolo/u-wsocket": "github:jimmyolo/uwsocket#v2.4.1"
  }
}
```

Distribution repo: [jimmyolo/uwsocket#npm](https://github.com/jimmyolo/uwsocket/tree/npm).

## Usage

One line changes:

```diff
- const { WebSocketServer } = require("ws");
+ const { WebSocketServer } = require("@jimmyolo/u-wsocket");
```

Everything downstream stays as written:

```js
const { WebSocketServer } = require("@jimmyolo/u-wsocket");

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", (ws, req) => {
    ws.on("message", (data, isBinary) => {
        ws.send(data, { binary: isBinary }); // echo
    });
});
```

ESM: `import { WebSocketServer } from "@jimmyolo/u-wsocket";`

## Options

✅ same as `ws` · ➕ this package's own, no `ws` counterpart · ❌ not supported

| Option | | Notes |
|---|---|---|
| `port` | ✅ | string or number |
| `host` | ✅ | |
| `path` | ✅ | |
| `maxPayload` | ⚠️ | 100 MB default; the peer reads a different close code — see [Known Limitation](#server-options) |
| `perMessageDeflate` | ✅ | |
| `clientTracking` | ✅ | populates `wss.clients` |
| `verifyClient` | ✅ | sync and callback forms |
| `handleProtocols` | ✅ | |
| `handleUpgrade` | ✅ | an async option, not a method — [below](#handleupgrade) |
| `allowSynchronousEvents` | ✅ | `true` by default |
| `maxBufferedMessages` | ➕ | 16384 by default — [below](#maxbufferedmessages) |
| `reusePort` | ➕ | `false` by default — [below](#reuseport) |
| `corkDispatch` | ➕ | `true` by default — [below](#corkdispatch) |
| `noServer` | ❌ | throws |

### `maxBufferedMessages`

Caps how many messages a paused connection retains before it is closed with 1008.

Why a count and not bytes: `maxPayload` bounds retained *bytes*, which is not a memory bound. A buffered 1-byte message costs ~724 bytes of RSS, so hitting the 100 MB byte cap with tiny messages needs ~100 million entries — and tens of GB — first. Measured before the cap existed: 200 000 one-byte messages held 0.19 % of `maxPayload` and grew RSS by 138 MB with the connection still open.

- Only applies while `pause()` is in effect. Raise it if an application legitimately pauses under a heavy burst.
- Must be a positive safe integer; anything else throws at construction. `0` would close every connection, and `NaN` or a value no array length can reach (`2**53`, `1e100`) would bound nothing.

### `reusePort`

μWebSockets.js binds with `SO_REUSEPORT`, letting several servers hold one port. **That is off here**, so a second bind emits `'error'` with `code: 'EADDRINUSE'` as `ws` does — an accidental second instance (double import, hot reload, forgotten server) fails at startup instead of quietly taking half the traffic.

```js
const wss = new WebSocketServer({ port: 8080, reusePort: true });
```

Every process sharing the port must set it, and the instances have to be interchangeable — which one receives a given connection is the kernel's choice.

### `corkDispatch`

Runs the `'message'` handler inside μWebSockets.js's cork, so a handler answering one message with several `send()` calls leaves as one write instead of one write each.

**On by default**, and at the default settings not observable — the dual-run suite passes with it on. Turn it off for a handler that must see its bytes leave at each `send()`:

```js
const wss = new WebSocketServer({ port: 8080, corkDispatch: false });
```

**Whether it is worth anything depends on the dispatch path.** μWebSockets.js corks a socket for its own callback, so under the default `allowSynchronousEvents: true` the handler is already inside a cork and this adds nothing. `allowSynchronousEvents: false` defers dispatch through `setImmediate`, outside that cork — there each `send()` really is its own write, and this option puts the batch back. At a fan-out of 32 on that path it takes round-trip p50 from 407 us to 41 us and server CPU per frame from 4.75 us to 0.37 us. Full tables: [docs/benchmarks.md](docs/benchmarks.md#corkdispatch--websocket).

Three things it changes, all timing rather than what arrives:

- **`await` ends the batch.** A cork closes when its callback returns, so an `async` handler batches only the part before its first `await`.
- **Bytes reach the socket later** — on handler return, not at each `send()`. Order and framing are identical, and `bufferedAmount` reads the same either way (it reports backpressure, not what the cork holds).
- **A throw still uncorks.** μWebSockets.js releases the cork and rethrows; sends made before the throw go out and the socket stays usable. A handler calling `cork()` itself nests cleanly.

Only a `'message'` from the socket is corked — not `'ping'`, `'pong'`, `'connection'`, nor the drain a `resume()` performs.

### `handleUpgrade`

In `ws` this is a method you call. Here it is an async **constructor option**, because μWebSockets.js owns the upgrade. It receives the `IncomingMessage`; return `false` to reject, or `(ws, req) => void` to accept and take the socket:

```js
const wss = new WebSocketServer({
    port: 8080,
    handleUpgrade: async (req) => {
        const user = await authenticate(req.headers.authorization);
        if (!user) return false; // rejected
        return (ws, req) => {
            ws.user = user;
            wss.emit("connection", ws, req);
        };
    }
});
```

A refused connection costs nothing: no `WebSocket` is constructed and no `connection` event fires.

### uWS-only socket methods

Five μWebSockets.js methods forwarded beyond the `ws` surface. No `ws` counterpart, so an application ignoring them is unaffected.

| Method | Returns | Notes |
|---|---|---|
| `subscribe(topic)` | `boolean` | join a native pub/sub topic |
| `unsubscribe(topic)` | `boolean` | `true` if it had been subscribed |
| `isSubscribed(topic)` | `boolean` | cheap check; `false` also means the socket is no longer open |
| `publish(topic, message, [isBinary], [compress])` | `boolean` | broadcast **excluding** this socket |
| `cork(fn)` | this socket | pack every send inside `fn` into one syscall |

```js
wss.on("connection", (ws) => {
    ws.subscribe("workspace");
    ws.publish("workspace", "someone joined");   // everyone else
});
wss.uwsApp.publish("workspace", "everyone gets this");   // including the sender
```

- Native fan-out is the reason to reach for this: publishing does not walk the connection list, so its cost does not scale with connected sockets the way a per-socket `send()` loop does. `wss.uwsApp.numSubscribers(topic)` gives the recipient count.
- **Topics are one flat, app-wide namespace with no access control.** Derive them server-side; passing client input to `subscribe()` lets a client join any other client's topic.
- Wildcard subscriptions (`room/#`, `room/+`) return `true` on the pinned build but match nothing.
- All five are guarded on `readyState`. Once past `OPEN` — including the `CLOSING` window `close()` opens — the four `boolean` methods return `false`, where μWebSockets.js itself throws `Invalid access of closed uWS.WebSocket`. `cork` still runs its callback, uncorked, with the sends inside reporting `WebSocket is not open: readyState 2 (CLOSING)`.

## Server-Sent Events

SSE is **not** part of the drop-in contract. It lives behind its own subpath, and nothing about it reaches the root namespace — `require("@jimmyolo/u-wsocket")` is still `ws` byte for byte.

**What it buys is one port.** An application already running WebSockets here can serve server-to-client streams off the same μWebSockets.js app instead of standing a second Node `http` server beside it. Session semantics are [better-sse](https://github.com/MatthewWid/better-sse)'s, re-exported unwrapped; this package adds the μWebSockets.js transport under them.

```js
const { mount, createChannel } = require("@jimmyolo/u-wsocket/sse");

const channel = createChannel();
mount(wss, { path: "/events", onSession: (s) => channel.register(s) });
```

Setup, `deferFlush`, the u-expresso interaction and the caveats: **[docs/sse.md](docs/sse.md)**.

## Known Limitation

⚠️ supported but not identically · ❌ not supported · ✅ everything else, not listed here

### Server options

- ❌ **`noServer`** — throws. No Node `http.Server` underneath to attach to.
- ❌ **`closeTimeout`** (`ws` 8.19.0) — μWebSockets.js has no close-frame wait to bound: `end()` and `close()` are both documented as "immediately calls the close handler", differing only in whether a frame is sent, and against 20.69.0 the peer's TCP connection is gone ~1 ms after `close()`. Stalls from other causes are reaped by `idleTimeout` (120 s here).
- ❌ **`maxBufferedChunks`, `maxFragments`** (`ws` 8.21.0) — both cap arrays inside `ws`'s own receiver. μWebSockets.js has neither: TCP chunks are consumed in C++, and a message's fragments are assembled into one contiguous buffer already bounded by `maxPayloadLength`. The vulnerability they close does have a counterpart here, in the `pause()` buffer — [`maxBufferedMessages`](#maxbufferedmessages) bounds it.
- ⚠️ **`maxPayload`** — the cap holds, but the peer is told a different thing. μWebSockets.js refuses an oversized message in C++ and drops the connection without a close frame, so the client reads **1006** where `ws` sends **1009** `WS_ERR_UNSUPPORTED_MESSAGE_LENGTH`. Nothing in JS runs early enough to send that frame: the message callback fires only once a message is whole.

  The server side is identical to `ws` — `'error'` with `code: 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'`, then `'close'` with 1006 and an empty reason. So a server can diagnose the overrun; a client can only tell the connection went away. One caveat: on a `perMessageDeflate` connection the size is checked after inflating, and μWebSockets.js reports a corrupt compressed frame through the same channel — so a bad frame is reported as an overrun. `ws` tells the two apart.

The rest of the constructor surface is in [Options](#options).

### Server methods

⚠️ **`wss.close([callback])`** — closes live connections; `ws` leaves them to drain. μWebSockets.js exposes one app-level close, documented as closing "all sockets including listen sockets", so stopping the listener and ending the connections is a single call.

| | `ws` | here |
| --- | --- | --- |
| the callback | fires once every connection has ended | fires next tick, before the peer observes the close |
| `wss.clients` at that point | still holds the live ones | already empty |
| what the peer receives | nothing — `close()` does not touch client sockets | 1006 — the connection is aborted, no close frame |
| a second `close()` | callback gets `Error: The server is not running` | callback runs with no error |

So a shutdown path that waits for the callback and then checks `wss.clients` reports a clean drain of connections that were cut. **To drain rather than cut:** `for (const c of wss.clients) c.close(1001)`, then `wss.close()` once they have gone.

A server built from `options.server` is the exception — only the first two rows describe it. The app is somebody else's, so that path closes nothing and leaves established sockets to the app's owner, as `ws` does. But the callback still fires next tick with `wss.clients` still populated, where `ws` withholds `close` until the last client has gone, so awaiting `close()` returns before anything drained here too. Further upgrades on the closed route are refused with a 503 — better than `ws`, which answers 503 only on its `noServer` path.

### Server-side `WebSocket` methods and properties

- ⚠️ **`ws.pong()`** — no-op that warns, and it takes no arguments, so a callback passed to it is never invoked: a promisified `pong()` never settles. μWebSockets.js auto-answers incoming pings and exposes no outgoing-pong API.
- ⚠️ **`ws.bufferedAmount` after `send()` on a closed socket** — stays where it was. `ws` credits the dropped payload's length to it before reporting the error; here the counter is μWebSockets.js's own and a rejected send never reaches it. The callback error is identical, so only a consumer polling the counter can see this.
- ⚠️ **`ws.send([buf1, buf2])`** — concatenates to `buf1 + buf2`; `ws` coerces the array through `Buffer.from`, reading every element as `NaN` and sending one `0x00` byte each. This is what makes echoing the `message` event's own data back work under `"fragments"`.
- ⚠️ **`ws.binaryType = "fragments"`** — hands back `[Buffer]`, a single-element array, not a true fragment list.

### Events

⚠️ **`'error'`** — protocol-level errors never reach JS land, on the server or its sockets, with one exception: a [`maxPayload`](#server-options) overrun emits it, because μWebSockets.js names that cause in the close reason. `'dropped'` (backpressure past `maxBackpressure`, default `min(max(2 * maxPayload, 1mb), 64mb)`) is the nearest signal for the rest; otherwise read the close code, since a `'close'` other than 1000 is the diagnostic.

### Package exports

- ⚠️ **`./sse`** ([Server-Sent Events](#server-sent-events)) — reachable only through the `exports` map, and its declarations only under `moduleResolution` `node16` or later. There is no `main`-style fallback for a subpath, so a resolver ignoring `exports` cannot see it, and a `node10` TypeScript consumer gets the runtime export untyped. Both deliberate: the alternative is `typesVersions`, which papers over the requirement rather than stating it.
- ⚠️ **`PerMessageDeflate`, `extension`, `subprotocol`** (`ws` 8.20.0) — re-exported at runtime, untyped. 8.20.0 promoted them to named exports on `ws`'s main entry, and this package re-exports that namespace, so they arrive with it. The deep paths stay unreachable even on 8.21.2: the `exports` map publishes only `.` and `./package.json`, so `require('ws/lib/extension')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. No declarations ship — `@types/ws` is still 8.18.1, predating the promotion — so a TypeScript caller needs its own.

## API

Implements the [`ws` API](https://github.com/websockets/ws/blob/master/doc/ws.md) for the server side. Every test file runs twice — once against `ws`, once against this package — asserting byte-identical stdout. **Where this README or the upstream docs disagree with `tests/`, `tests/` wins.**

The surface this package exposes:

- **`WebSocketServer`** — an `EventEmitter`; events `connection`, `close`, `listening`, `headers`
- **Server-side `WebSocket`** — properties `readyState`, `bufferedAmount`, `protocol`, `extensions`, `binaryType`, `isPaused`; methods `send(data, [options], [callback])`, `close([code], [reason])`, `terminate()`, `ping()`, `pause()`, `resume()`, plus the [uWS-only ones](#uws-only-socket-methods); events `message`, `close`, `ping`, `pong`, `error`, `drain`, `dropped`
- **DOM-style handlers** — `onmessage`, `onclose`, `onerror`, `onopen`, `addEventListener`, `removeEventListener`

The detailed reference is not duplicated here — it lives upstream:

| Topic | Upstream section |
| --- | --- |
| What is and is not supported, versus `ws` | [Compatibility](https://github.com/dimdenGD/ultimate-ws#compatibility) |
| Constructor options in full | [Server options](https://github.com/dimdenGD/ultimate-ws#server-options) |
| `WebSocketServer` events and properties | [Server events](https://github.com/dimdenGD/ultimate-ws#server-events) · [Server properties](https://github.com/dimdenGD/ultimate-ws#server-properties) |
| The server-side socket handed to `connection` | [WebSocket](https://github.com/dimdenGD/ultimate-ws#websocket) |
| Reading the request before the upgrade completes | [Handling requests before connection](https://github.com/dimdenGD/ultimate-ws#handling-requests-before-connection) |
| TLS | [HTTPS](https://github.com/dimdenGD/ultimate-ws#https) |
