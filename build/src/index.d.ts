import * as ws from 'ws';
import * as uWS from 'uWebSockets.js';
import { IncomingMessage } from 'http';
import { Duplex, DuplexOptions } from 'stream';

type SendReturnType = 0 | 1 | 2;
interface SendOptions {
  binary?: boolean;
  compress?: boolean;
}

type HandleUpgradeResult<T, U> = (ws: T, request: U) => void | false | void;
type UExpressApp = { uwsApp: uWS.TemplatedApp, [key: string]: any };
type UnsupportedOptions = 'noServer' | 'skipUTF8Validation' | 'backlog';

// [Client] Class: WebSocket
declare class WebSocket extends ws.WebSocket {}

declare namespace WebSocket {
  interface ServerOptions<
    T extends typeof WebSocketClient = typeof WebSocketClient,
    U extends typeof IncomingMessage = typeof IncomingMessage,
  > extends Omit<ws.ServerOptions<T, U>, UnsupportedOptions | 'server' | 'perMessageDeflate'> {
    perMessageDeflate?: boolean | uWS.CompressOptions | ws.PerMessageDeflateOptions;
    uwsOptions?: uWS.AppOptions;
    server?: UExpressApp | uWS.TemplatedApp;
    maxBackpressure?: number;
    idleTimeout?: 120;
    maxLifetime?: 0;
    closeOnBackpressureLimit?: false;
    handleUpgrade?: (request: T) => Promise<HandleUpgradeResult<T, U>> | HandleUpgradeResult<T, U>;
  }

  class WebSocketServer<
    T extends typeof WebSocketClient = typeof WebSocketClient,
    U extends typeof IncomingMessage = typeof IncomingMessage,
  > extends ws.WebSocketServer<T, U> {
    constructor(options: ServerOptions<T, U>);
    readonly uwsApp: uWS.TemplatedApp;
    override handleUpgrade: never;
  }

  const Server: typeof WebSocketServer

  const WebSocket: typeof ws.WebSocket
  interface WebSocket extends ws.WebSocket{}
  interface ClientOptions extends ws.ClientOptions{}

  function createWebSocketStream(websocket: WebSocket | WebSocketClient, options?: DuplexOptions): Duplex
}

// [Server] websocket connection
class WebSocketClient extends ws.WebSocket {
  static readonly CONNECTING: 0;
  static readonly OPEN: 1;
  static readonly CLOSING: 2;
  static readonly CLOSED: 3;

  send(
    message: uWS.RecognizedString,
    callback?: (err?: Error) => void,
  ): SendReturnType;
  send(
    message: uWS.RecognizedString,
    options: SendOptions,
    callback?: (err?: Error) => void,
  ): SendReturnType;

  ping(data?: uWS.RecognizedString): void;
  pong(): void;
}

export = WebSocket;