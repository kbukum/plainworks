import type { ErrorSnapshot } from "@plainworks/std"
import type { Json } from "../privacy"
import type { CommandDescriptor } from "./command"
import type { SourceEvent } from "./event"
import type { SourceId } from "./identity"
import type { StatusIndicator } from "./indicator"

/**
 * What the panel learns about a source when it is discovered: its identity, a human label, and the
 * commands it advertises. It describes *what can be observed*, never how it is rendered.
 */
export interface SourceDescriptor {
  readonly id: SourceId
  readonly label: string
  readonly commands: readonly CommandDescriptor[]
}

/**
 * A message flowing host to client. Discovery, events, indicators, and results are all summaries or
 * identifiers — expensive detail is fetched on demand. Every variant is serializable; a source id
 * and, for events, a monotonic `seq` let the client order and deduplicate per source.
 */
export type DevtoolsMessage =
  | { readonly type: "source-added"; readonly source: SourceDescriptor }
  | { readonly type: "source-removed"; readonly id: SourceId }
  | { readonly type: "source-failed"; readonly id: SourceId; readonly error: ErrorSnapshot }
  | { readonly type: "source-recovered"; readonly id: SourceId }
  | {
      readonly type: "event"
      readonly id: SourceId
      readonly seq: number
      readonly event: SourceEvent
    }
  | { readonly type: "indicator"; readonly id: SourceId; readonly indicator: StatusIndicator }
  | { readonly type: "dropped"; readonly id: SourceId | null; readonly count: number }
  | ({ readonly type: "detail-result"; readonly requestId: string } & DetailOutcome)
  | ({ readonly type: "command-result"; readonly requestId: string } & CommandOutcome)
  | { readonly type: "disposed" }

/** Success carries the source `seq` at resolution so the client can reject a stale detail. */
type DetailOutcome =
  | { readonly ok: true; readonly seq: number; readonly value: Json }
  | { readonly ok: false; readonly error: ErrorSnapshot }

type CommandOutcome =
  | { readonly ok: true; readonly value: Json }
  | { readonly ok: false; readonly error: ErrorSnapshot }

/**
 * A request flowing client to host. Detail and command requests carry a `requestId` the client
 * correlates with the matching result; `cancel` withdraws an in-flight request by that id. Command
 * input is already-validated serializable data — never an executable callback.
 */
export type DevtoolsRequest =
  | {
      readonly type: "detail-request"
      readonly requestId: string
      readonly id: SourceId
      readonly ref: string
    }
  | {
      readonly type: "command-request"
      readonly requestId: string
      readonly id: SourceId
      readonly commandId: string
      readonly input: Json
    }
  | { readonly type: "cancel"; readonly requestId: string }

/** Host-to-client transport frame; `protocol` lets the peer reject an incompatible version. */
export interface MessageEnvelope {
  readonly protocol: number
  readonly message: DevtoolsMessage
}

/** Client-to-host transport frame. */
export interface RequestEnvelope {
  readonly protocol: number
  readonly request: DevtoolsRequest
}
