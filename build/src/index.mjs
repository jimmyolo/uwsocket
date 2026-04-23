import WebSocket, { createWebSocketStream } from "ws";
import { default as WebSocketServer } from "./server.js";

export { WebSocketServer, WebSocket, createWebSocketStream };
export default WebSocket;