// `ws` ships no types, so this public import resolves through `@types/ws` — which
// is why that package sits in `dependencies`, not `devDependencies` (issue #34).
// It costs a pure-JS consumer one types-only install; the alternative is copying
// the `ws.Server` members this surface merges in and letting them drift.
import * as ws from 'ws';
// `@jimmyolo/uws.js`, not `uWebSockets.js`: the latter is an optionalDependency,
// so a skipped install degrades every type sourced from it to `any`. The fork's
// declarations are the canonical ones for this package's public types — a
// consumer who also installs upstream `uWebSockets.js` gets `TemplatedApp` from
// a second declaration file, and the two only interoperate structurally.
import * as uWS from '@jimmyolo/uws.js';
import { ClientRequestArgs, IncomingMessage } from 'http';
import { Duplex, DuplexOptions } from 'stream';

// [Client] Class: WebSocket — re-exported from `ws` unchanged.
//
// Uses the interface + class declaration-merge pattern (same as
// `WebSocketServer` below) so the static side does not trigger the
// `TS2417` variance check against `ws.WebSocket`. The interface
// declaration merges in `ws.WebSocket`'s instance side; the class
// declaration stands alone for the static side so no inheritance
// comparison happens between our narrower namespace (whose `Server`
// re-export points at our `ServerOptions` with `server` narrowed to
// `UwsAppHost | uWS.TemplatedApp`) and ws.WebSocket's static `Server`.
interface WebSocket extends ws.WebSocket {}
declare class WebSocket {
  // Constructor overloads mirror `@types/ws`'s `WebSocket` — the class
  // declaration here doesn't `extends ws.WebSocket` (to avoid the
  // static-side TS2417 variance check against our narrower namespace), so
  // these signatures must be declared explicitly. Without them, consumers
  // doing `new WebSocket('ws://...')` would hit a parameterless-constructor
  // type error even though it works at runtime.
  constructor(address: null);
  constructor(
    address: string | URL,
    options?: ws.ClientOptions | ClientRequestArgs,
  );
  constructor(
    address: string | URL,
    protocols?: string | string[],
    options?: ws.ClientOptions | ClientRequestArgs,
  );

  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSING: 2;
  static readonly CLOSED: 3;
}

declare namespace WebSocket {
  // uWS WebSocket.send() return: 0 = dropped, 1 = backpressure, 2 = success
  type SendStatus = 0 | 1 | 2;

  interface SendOptions {
    binary?: boolean;
    compress?: boolean;
  }

  // Any object that exposes a uWS `uwsApp` (e.g. ultimate-ws wrappers).
  interface UwsAppHost {
    uwsApp: uWS.TemplatedApp;
  }

  type UnsupportedOptions = 'noServer' | 'skipUTF8Validation' | 'backlog';

  // Resolved value of `ServerOptions.handleUpgrade`:
  //   - `false`           → abort the upgrade
  //   - function          → invoked instead of emitting the "connection" event
  //   - `void`/undefined  → continue normal connection flow
  type HandleUpgradeResult<
    T extends typeof WebSocketClient = typeof WebSocketClient,
    U extends typeof IncomingMessage = typeof IncomingMessage,
  > =
    | false
    | ((client: InstanceType<T>, request: InstanceType<U>) => void)
    | void;

  interface ServerOptions<
    T extends typeof WebSocketClient = typeof WebSocketClient,
    U extends typeof IncomingMessage = typeof IncomingMessage,
  > extends Omit<ws.ServerOptions<T, U>, UnsupportedOptions | 'server' | 'perMessageDeflate'> {
    perMessageDeflate?: boolean | uWS.CompressOptions | ws.PerMessageDeflateOptions;
    uwsOptions?: uWS.AppOptions;
    server?: UwsAppHost | uWS.TemplatedApp;
    maxBackpressure?: number;
    idleTimeout?: number;
    maxLifetime?: number;
    closeOnBackpressureLimit?: boolean;
    handleUpgrade?: (
      request: InstanceType<U>,
    ) => Promise<HandleUpgradeResult<T, U>> | HandleUpgradeResult<T, U>;
  }

  // Class + interface merge: class owns the static side (no `extends ws.WebSocketServer`
  // here, which avoids the static-side variance check between our narrower
  // `ServerOptions` and ws's), while the interface declaration-merges in all
  // instance members from `ws.WebSocketServer`.
  interface WebSocketServer<
    T extends typeof WebSocketClient = typeof WebSocketClient,
    U extends typeof IncomingMessage = typeof IncomingMessage,
  > extends ws.Server<T, U> {
    readonly uwsApp: uWS.TemplatedApp;
    // Not exposed as a method — pass `handleUpgrade` via ServerOptions instead.
    handleUpgrade: never;
  }

  class WebSocketServer<
    T extends typeof WebSocketClient = typeof WebSocketClient,
    U extends typeof IncomingMessage = typeof IncomingMessage,
  > {
    constructor(options: ServerOptions<T, U>);
  }

  const Server: typeof WebSocketServer;

  // Re-exports from `ws` (client-side classes are not modified by u-wsocket).
  const WebSocket: typeof ws.WebSocket;
  interface WebSocket extends ws.WebSocket {}
  interface ClientOptions extends ws.ClientOptions {}

  function createWebSocketStream(
    websocket: WebSocket | WebSocketClient,
    options?: DuplexOptions,
  ): Duplex;

  // [Server] websocket connection — instance passed to the "connection" event handler.
  class WebSocketClient extends ws.WebSocket {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;

    // `readonly Buffer[]` covers `ws.RawData`'s array member, which the "message"
    // event yields under `binaryType = "fragments"`; send() concatenates it.
    send(
      message: uWS.RecognizedString | readonly Buffer[],
      callback?: (err?: Error) => void,
    ): SendStatus;
    send(
      message: uWS.RecognizedString | readonly Buffer[],
      options: SendOptions,
      callback?: (err?: Error) => void,
    ): SendStatus;

    ping(cb?: (err?: Error) => void): void;
    ping(data: uWS.RecognizedString, cb?: (err?: Error) => void): void;
    ping(
      data: uWS.RecognizedString,
      mask: boolean,
      cb?: (err?: Error) => void,
    ): void;

    /**
     * @deprecated Not supported by uWebSockets.js — call is a no-op that logs a warning.
     * uWS responds to incoming pings with pong frames automatically.
     */
    pong(): void;
  }
}

export = WebSocket;
