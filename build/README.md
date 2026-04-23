# @jimmyolo/u-wsocket

基於 [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) 的高效能 WebSocket server，提供與 [`ws`](https://github.com/websockets/ws) 相容的 API。

## 為什麼選擇這個

`ws` 是純 Node.js 實作，效能受限於單執行緒。uWebSockets.js 是 C++ 實作的 WebSocket 引擎，能以更低的記憶體處理更多連線。這個 library 讓你直接替換 `ws`，不需修改應用程式程式碼。

## 系統需求

- Node.js `>=22 <23` 或 `>=24 <25`

## 安裝

透過 GitHub 安裝（公開）：

```bash
# https://github.com/jimmyolo/uwsocket
npm install github:jimmyolo/uwsocket
```

指定版本：

```bash
npm install github:jimmyolo/uwsocket#v2.0.1
```

或在 `package.json` 中指定：

```json
{
  "dependencies": {
    "@jimmyolo/u-wsocket": "github:jimmyolo/uwsocket#v2.0.1"
  }
}
```

## 使用方式

API 與 `ws` 相容，只需替換 import，其餘程式碼維持不變。

```js
// 替換前
const { WebSocketServer } = require("ws");

// 替換後
const { WebSocketServer } = require("@jimmyolo/u-wsocket");
```

### 基本範例

```js
const { WebSocketServer } = require("@jimmyolo/u-wsocket");

const wss = new WebSocketServer({ port: 8080 }, () => {
    console.log("Server listening on port 8080");
});

wss.on("connection", (ws, req) => {
    ws.on("message", (data, isBinary) => {
        ws.send(data, { binary: isBinary }); // echo
    });

    ws.on("close", (code, reason) => {
        console.log("Client disconnected", code, reason.toString());
    });
});
```

### ESM

```js
import { WebSocketServer } from "@jimmyolo/u-wsocket";
```

## 支援的 Options

| Option | 支援 | 說明 |
|---|---|---|
| `port` | ✅ | 字串或數字皆可 |
| `host` | ✅ | |
| `path` | ✅ | |
| `maxPayload` | ✅ | 預設 100 MB |
| `perMessageDeflate` | ✅ | |
| `clientTracking` | ✅ | `wss.clients` Set |
| `verifyClient` | ✅ | 同步與 callback 兩種形式皆支援 |
| `handleProtocols` | ✅ | |
| `handleUpgrade` | ✅ | async function，詳見下方說明 |
| `allowSynchronousEvents` | ✅ | 預設 `true` |
| `noServer` | ❌ | 不支援 |

### `handleUpgrade`

與 `ws` 不同，`handleUpgrade` 在這裡是傳入 constructor 的 async option，而非手動 upgrade 的 method。接收 `IncomingMessage`，回傳 `false` 拒絕連線，或回傳 handler function `(ws, req) => void` 接受連線：

```js
const wss = new WebSocketServer({
    port: 8080,
    handleUpgrade: async (req) => {
        const user = await authenticate(req.headers.authorization);
        if (!user) return false; // 拒絕連線
        return (ws, req) => {
            ws.user = user;
            wss.emit("connection", ws, req);
        };
    }
});
```

## 與 `ws` 的已知差異

- **`ws.pong()`** 不支援 — uWebSockets.js 自動處理 pong，呼叫此方法只會印出警告。
- **`noServer` option** 不支援。
- **Client-side `WebSocket`** 直接 re-export 自 `ws`，維持不變 — 只有 server 端被替換。

## API 參考

### `WebSocketServer`

繼承 `EventEmitter`，constructor options 與 events 與 `ws.WebSocketServer` 相容。

**Events:** `connection`, `close`, `listening`, `headers`

### Server-side `WebSocket`（由 `connection` event 取得）

**Properties:** `readyState`, `bufferedAmount`, `protocol`, `extensions`, `binaryType`, `isPaused`

**Methods:** `send(data, [options], [callback])`, `close([code], [reason])`, `terminate()`, `ping()`, `pause()`, `resume()`

**Events:** `message`, `close`, `ping`, `pong`, `error`, `drain`, `dropped`

**DOM-style handlers:** `onmessage`, `onclose`, `onerror`, `onopen` — 另支援 `addEventListener` / `removeEventListener`

## License

MIT
