// Server-safe public entry for `@plainworks/channel`: the channel lifecycle and its typed error.
// The event router lives on `./events`, the SSE and WebSocket transports on `./transport`, and the
// React binding on `./client`. The wire seam the transports implement is `@plainworks/std/seam`.
// Re-export-only barrel. No React or DOM imports, so the `.` entry runs anywhere (Node, edge,
// workers, RSC).
export { ChannelError, type ChannelErrorKind } from "./error"
export {
  type Channel,
  type ChannelOptions,
  type ChannelStatus,
  createChannel,
  isTerminalStatus,
} from "./lifecycle"
