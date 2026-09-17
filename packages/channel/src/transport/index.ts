// Re-export-only barrel for the transport concern: the pluggable wire seams a channel dials
// through — `sse` over an HTTP stream, `ws` over a WebSocket — plus the url resolver they share.
// No logic here.
export { createSseTransport, type SseTransportOptions } from "./sse"
export { resolveUrl, type UrlSource } from "./url"
export {
  createWsTransport,
  type WebSocketConnectInit,
  type WebSocketFactory,
  type WebSocketLike,
  type WsHeartbeat,
  type WsTransportOptions,
} from "./ws"
