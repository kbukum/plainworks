// Server-safe public entry for `@plainworks/channel` — a re-export-only barrel (no logic here; the
// implementation lives in concern modules). No React or DOM imports, so the `.` entry — the channel
// core, the sse and ws transports, and the event router — runs anywhere (Node, edge, workers, RSC).
// The React hooks live at the separate `./client` entry.

// Wire seam (defined in std so a testkit transport double can speak it without a package cycle)
export type {
  StreamFrame,
  StreamTransport,
  StreamTransportContext,
  StreamTransportFactory,
} from "@plainworks/std"
// Typed error + wire seam
export { ChannelError, type ChannelErrorKind } from "./error"
// Event router + sinks
export {
  createEventRouter,
  createStateSink,
  type EventDecoder,
  type EventRouter,
  type EventRouterOptions,
  type EventSink,
  jsonDecoder,
  type StateProjection,
} from "./events"
// Core lifecycle
export {
  type Channel,
  type ChannelOptions,
  type ChannelStatus,
  createChannel,
  isTerminalStatus,
} from "./lifecycle"
// Transports
export {
  createSseTransport,
  createWsTransport,
  resolveUrl,
  type SseTransportOptions,
  type UrlSource,
  type WebSocketConnectInit,
  type WebSocketFactory,
  type WebSocketLike,
  type WsHeartbeat,
  type WsTransportOptions,
} from "./transport"
