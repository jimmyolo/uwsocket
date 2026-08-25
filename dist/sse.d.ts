import {EventEmitter} from 'node:events';
import {IncomingMessage} from 'node:http';

import * as uWS from '@jimmyolo/uws.js';
import {Channel, Connection, Session, SessionOptions} from 'better-sse';

/**
 * better-sse's surface, re-exported rather than restated. A hand-copied clone of
 * a 0.x type drifts silently on every bump, and a renamed member would then be
 * a consumer break this package never noticed.
 */
export {
  Channel,
  Connection,
  createChannel,
  createEventBuffer,
  createSession,
  EventBuffer,
  NodeHttp1Connection,
  Session,
  SseError,
} from 'better-sse';

/** Any object exposing a uWS app, so an SSE route can be mounted on it. */
export interface UwsAppHost {
  uwsApp: uWS.TemplatedApp;
}

export interface SseOptions<State = Record<string, unknown>>
  extends SessionOptions<State> {
  /** Route to register. Defaults to `"/sse"` — never `"/*"`, which would shadow the WebSocket route. */
  path?: string;
  /**
   * Return `false` to refuse the request with 401. Synchronous only.
   *
   * A guard may take the socket down itself — `request.socket.destroy()` — and a
   * request already dropped that way is answered with nothing. What it must not
   * do is write to the response or end it: uWS gives the status line one owner,
   * and the session takes it over from here. A guard that does it anyway is not
   * fatal — the head write fails, the connection is dropped, `onSession` never
   * runs, and the failure arrives on `'error'` as `SSE_ERR_HEAD_FAILED`.
   */
  verify?: (request: IncomingMessage) => boolean;
  /**
   * Called once the session is connected, and not called at all if the client
   * disconnected first. Synchronous: an `await` inside it reopens the window
   * `createHistory`'s replay-then-register rule exists to close. A throw — or a
   * rejection, if written `async` anyway — is reported on `'error'` and closes
   * the connection, rather than leaving a half-configured stream open.
   */
  onSession?: (session: Session<State>, request: IncomingMessage) => void;
  /**
   * Bytes allowed to queue without draining before the connection is dropped
   * with `SSE_ERR_TOO_MUCH_BUFFERED_DATA`. Defaults to 1 MiB. A positive safe
   * integer; anything else throws.
   */
  maxBufferedBytes?: number;
  /**
   * Batch the chunks a turn produces into one write, flushed on the next
   * `setImmediate` — or as soon as 64 KiB is queued, whichever comes first. Off
   * by default, because it delays every event by an event-loop turn. A
   * `maxBufferedBytes` below 64 KiB lowers that threshold to itself, so the cap
   * still bounds what one connection holds. See README § `deferFlush`.
   */
  deferFlush?: boolean;
}

export interface SseHandler {
  (res: uWS.HttpResponse, req: uWS.HttpRequest): void;
  /**
   * Where this handler reports. Declared because it is the only error channel on
   * the raw-handler path — `mount()` forwards it to the handle's `'error'`, but a
   * hand-mounted handler has nowhere else to look. With no subscriber the error
   * becomes a `process.emitWarning` rather than a throw: the overrun path is
   * driven by a client that stops reading, so crashing would make it remotely
   * triggerable.
   */
  readonly emitter: EventEmitter;
}

export interface SseHandle {
  readonly uwsApp: uWS.TemplatedApp;
  readonly path: string;
  readonly ownsApp: boolean;
  /** Bound port, once `'listening'` has fired. Only set for an app `mount()` created. */
  readonly port: number | undefined;
  close(callback?: () => void): void;
  on(event: 'listening', listener: (port: number) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  once(event: 'listening', listener: (port: number) => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  off(event: 'listening', listener: (port: number) => void): this;
  off(event: 'close', listener: () => void): this;
  off(event: 'error', listener: (err: Error) => void): this;
}

/** Raw uWS handler, for mounting on an app yourself. */
export function sseHandler<State = Record<string, unknown>>(
  options?: SseOptions<State>,
): SseHandler;

/**
 * Register an SSE route on a borrowed app, or on one created here from `{ port }`.
 *
 * A borrowed app keeps its other routes: `close()` only takes the app down when
 * `mount()` created it.
 */
export function mount<State = Record<string, unknown>>(
  host: UwsAppHost | uWS.TemplatedApp | {port: number},
  options?: SseOptions<State>,
): SseHandle;

/** better-sse `Connection` over a raw uWS `HttpResponse`. */
export class UwsConnection extends Connection {
  /**
   * Declared because the base class declares none: without this the inherited
   * signature is `()` and every consumer constructing one fails to compile.
   */
  constructor(
    request: IncomingMessage,
    res: uWS.HttpResponse,
    options?: {
      statusCode?: number;
      headers?: Record<string, string | string[]>;
      maxBufferedBytes?: number;
      deferFlush?: boolean;
      onOverrun?: (err: Error) => void;
    },
  );
  url: URL;
  request: Request;
  response: Response;
  readonly isDead: boolean;
  sendHead(): void;
  sendChunk(chunk: string): void;
  cleanup(): void;
  /** Report that the socket is already gone. Called from the route's `onAborted`. */
  abort(): void;
  /** Abort and take the socket down. */
  close(): void;
}

export interface SseHistory {
  /** Events currently retained, never more than `size`. */
  readonly length: number;
  /**
   * Push everything recorded after the session's `lastId`, returning how many
   * were replayed — 0 for a fresh client, and 0 for an id that has already
   * fallen out of the window.
   */
  replay(session: Session): number;
}

/**
 * Bounded `Last-Event-ID` replay for one `Channel`.
 *
 * A window, not durability: only the last `size` broadcasts are retained, only
 * channel broadcasts are recorded (a per-session `push()` has no shared identity
 * to resume against), and the store is per-process and in memory, so nothing
 * survives a restart or reaches another process under `reusePort`.
 *
 * A broadcast carrying a `filter` is **not** recorded: it was aimed at a subset,
 * and replay cannot re-decide who was eligible, so recording it would let an
 * excluded session reconnect with an earlier `Last-Event-ID` and receive it.
 * Separate audiences need separate channels.
 *
 * Wraps the channel's `broadcast` in order to see that `filter`, so call it once
 * per channel.
 *
 * Call `replay(session)` and then `channel.register(session)` with no `await`
 * between them.
 */
export function createHistory(
  channel: Channel,
  options?: {size?: number},
): SseHistory;
