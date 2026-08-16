import * as ws from 'ws';
import * as uWS from '@jimmyolo/uws.js';

import { ClientRequestArgs, IncomingMessage } from 'http';
import { Duplex, DuplexOptions } from 'stream';

/**
 * [Client] Class: WebSocket — re-exported from `ws` unchanged.
 *
 * Declared as interface + class rather than `extends ws.WebSocket`, here and
 * for `WebSocketServer` below. The interface merges in the instance side; the
 * class stands alone for the static side, so no inheritance comparison happens
 * between our narrower namespace and ws's — which would fail `TS2417`, since
 * our `Server` re-export narrows `ServerOptions.server`.
 *
 * The cost is that the constructor overloads have to be spelled out: without
 * them `new WebSocket('ws://...')` is a type error against a class TypeScript
 * sees as parameterless.
 */
interface WebSocket extends ws.WebSocket {}
declare class WebSocket {
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
  // uWS send() return: 0 = backpressure built up, 1 = success, 2 = dropped
  type SendStatus = 0 | 1 | 2;

  interface SendOptions {
    binary?: boolean;
    compress?: boolean;
  }

  // Any object exposing a uWS app, so a server can be handed one to mount on.
  interface UwsAppHost {
    uwsApp: uWS.TemplatedApp;
  }

  type UnsupportedOptions = 'noServer' | 'skipUTF8Validation' | 'backlog';

  /**
   * Resolved value of `ServerOptions.handleUpgrade`:
   *   - `false`           abort the upgrade
   *   - function          invoked instead of emitting the "connection" event
   *   - `void`/undefined  continue normal connection flow
   */
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
    /** Defaults to `min(max(2 * maxPayload, 1mb), 64mb)`. */
    maxBackpressure?: number;
    idleTimeout?: number;
    maxLifetime?: number;
    closeOnBackpressureLimit?: boolean;
    /**
     * The maximum number of messages retained while a connection is paused.
     * Exceeding it closes the connection with 1008
     * `WS_ERR_TOO_MANY_BUFFERED_PARTS`. Defaults to 16384. A positive safe
     * integer; anything else throws.
     *
     * `maxPayload` bounds the retained *bytes*, which is not a memory bound —
     * see README § `maxBufferedMessages`.
     */
    maxBufferedMessages?: number;
    /**
     * Bind with `SO_REUSEPORT`, letting several servers share one port and the
     * kernel spread the connections across them. Off by default, so a second
     * bind fails with `EADDRINUSE` as it does under `ws`.
     */
    reusePort?: boolean;
    /**
     * Run the `'message'` handler inside a cork, so every `send()` it makes
     * leaves as one write instead of one each. On by default, and `ws` has no
     * equivalent either way: under the default `allowSynchronousEvents: true`
     * it changes nothing, since uWS's own callback cork already covers the
     * handler, and with that option off it is worth up to 92% of the server's
     * per-frame CPU. Set it to `false` for a handler that must see its bytes
     * leave at each `send()` rather than when it returns. Covers a message
     * arriving from the socket, not the drain a `resume()` performs — see
     * README § `corkDispatch`.
     */
    corkDispatch?: boolean;
    handleUpgrade?: (
      request: InstanceType<U>,
    ) => Promise<HandleUpgradeResult<T, U>> | HandleUpgradeResult<T, U>;
  }

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
    // `number` matches `@types/ws`'s BufferLike: it is stringified before framing.
    // `undefined` is the return on a non-OPEN socket, where nothing is framed and
    // the error goes to the callback instead.
    send(
      message: uWS.RecognizedString | readonly Buffer[] | number,
      callback?: (err?: Error) => void,
    ): SendStatus | undefined;
    send(
      message: uWS.RecognizedString | readonly Buffer[] | number,
      options: SendOptions,
      callback?: (err?: Error) => void,
    ): SendStatus | undefined;

    ping(cb?: (err?: Error) => void): void;
    ping(data: uWS.RecognizedString | number, cb?: (err?: Error) => void): void;
    ping(
      data: uWS.RecognizedString | number,
      mask: boolean,
      cb?: (err?: Error) => void,
    ): void;

    /**
     * @deprecated Not supported by uWebSockets.js — call is a no-op that logs a warning.
     * uWS responds to incoming pings with pong frames automatically.
     */
    pong(): void;

    /**
     * uWS-only
     *  - subscribe
     *  - unsubscribe
     *  - isSubscribed
     *  - publish
     *  - cork
     */
    subscribe(topic: uWS.RecognizedString): boolean;
    unsubscribe(topic: uWS.RecognizedString): boolean;
    isSubscribed(topic: uWS.RecognizedString): boolean;
    publish(
      topic: uWS.RecognizedString,
      message: uWS.RecognizedString,
      isBinary?: boolean,
      compress?: boolean,
    ): boolean;

    cork(fn: () => void): this;

    /**
     * uWS-only end
     */
  }
}

export = WebSocket;
