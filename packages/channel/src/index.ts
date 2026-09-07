// Server-safe public entry for `@plainworks/channel` — a re-export-only barrel (no logic here; the
// implementation lives in concern modules). No React or DOM imports, so the `.` entry — the channel
// core, the sse and ws transports, and the event router — runs anywhere (Node, edge, workers, RSC).
// The React hooks live at the separate `./client` entry.

// Transports
export { createSseTransport, type SseTransportOptions } from "./adapter/sse"
export { resolveUrl, type UrlSource } from "./adapter/url"
export {
  createWsTransport,
  resolveGlobalSocketFactory,
  SOCKET_OPEN,
  type WebSocketConnectInit,
  type WebSocketFactory,
  type WebSocketLike,
  type WsHeartbeat,
  type WsTransportOptions,
} from "./adapter/ws"
// Typed error + wire seam
export { ChannelError, type ChannelErrorKind } from "./error"
// Event router + sinks
export {
  createEventRouter,
  createStateSink,
  type DecodedEvent,
  type EventDecoder,
  type EventRouter,
  type EventRouterOptions,
  type EventSink,
  jsonDecoder,
  type StateProjection,
} from "./events"
// Core lifecycle
export { type Channel, type ChannelOptions, createChannel } from "./lifecycle/channel"
export { type ChannelStatus, isTerminalStatus } from "./lifecycle/status"
export type { ChannelFrame, Transport, TransportContext, TransportFactory } from "./transport"
