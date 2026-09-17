// Re-export-only barrel for the lifecycle concern: the channel itself and the status it moves
// through while connecting, reconnecting, and closing. No logic here.
export { type Channel, type ChannelOptions, createChannel } from "./channel"
export { type ChannelStatus, isTerminalStatus } from "./status"
