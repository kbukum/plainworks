// Server-safe public entry for `@plainworks/devtools`: the prelude every source, adapter, and panel
// speaks — the serializable protocol vocabulary and the `Source` contract. The session lives on
// `./session`, the client-side store on `./store`, the transport on `./bridge`, redaction on
// `./privacy`, and bounded history on `./retention`. Re-export-only barrel. No React, DOM, or host
// global appears here, so the `.` entry runs anywhere: Node, edge, RSC, and React Native.
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
export type { Source, SourceHandle, SourceObserver } from "./source"
