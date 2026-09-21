// Server-safe public entry for `@plainworks/devtools` — a re-export-only barrel over the neutral
// concern modules (protocol, privacy, retention, bridge, source, session). No React, DOM, or host
// global appears here, so the `.` entry runs anywhere: Node, edge, RSC, and React Native.
export {
  type Bridge,
  type BridgePort,
  createMemoryBridge,
  type MemoryBridgeOptions,
} from "./bridge"
export { isJson, type Json, type SanitizeOptions, sanitize } from "./privacy"
export {
  type CommandDescriptor,
  type CommandRisk,
  type DetailRef,
  type DevtoolsMessage,
  type DevtoolsRequest,
  isCompatibleProtocol,
  isSeverity,
  type MessageEnvelope,
  PROTOCOL_VERSION,
  ProtocolError,
  type ProtocolErrorKind,
  parseCommandInput,
  type RequestEnvelope,
  type Severity,
  type SourceDescriptor,
  type SourceEvent,
  type SourceId,
  type StatusIndicator,
  sourceIdEquals,
  sourceKey,
  validateMessageEnvelope,
  validateRequestEnvelope,
} from "./protocol"
export {
  createEventSampler,
  createRetentionBuffer,
  type EventSampler,
  type EventSamplerOptions,
  type RetentionBuffer,
  type RetentionCapacity,
  type RetentionEntry,
  type SamplingMode,
} from "./retention"
export {
  createDevtoolsSession,
  type DetailResult,
  type DevtoolsClientPort,
  type DevtoolsSession,
  type DevtoolsSessionOptions,
  type DevtoolsSnapshot,
  DuplicateSourceError,
  type IndicatorEntry,
  RequestError,
  type RequestErrorKind,
} from "./session"
export type { Source, SourceHandle, SourceObserver } from "./source"
