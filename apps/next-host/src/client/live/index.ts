"use client"

// Re-export-only barrel for the live task stream: the demo transport, the channel, and its sinks.
export { createDemoTransport } from "./demo-task-stream"
export { LiveActivity } from "./live-activity"
export { LiveChannelProvider, LiveTaskSink, type LiveTasks, useLiveChannel } from "./live-stream"
