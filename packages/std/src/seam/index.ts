// Re-export-only barrel for the seam concern: the contracts a host, adapter, or transport
// implements so a higher layer can depend on the shape instead of an implementation. No logic here.
export type { AuthContext, AuthHeaderProvider, AuthHeaders } from "./auth"
export type { AuthorizationRequest, Authorizer, Decision } from "./authorization"
export type { EventSink, Listener, PlainEvent, Subscription } from "./events"
export type { Identity } from "./identity"
export type { RedirectSignal } from "./redirect"
export type {
  InferSchemaOutput,
  StandardSchemaFailure,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaProps,
  StandardSchemaResult,
  StandardSchemaSuccess,
  StandardSchemaTypes,
  StandardSchemaV1,
} from "./schema"
export { guardSchema, unsafePassthrough, validateWithSchema } from "./schema"
export type { StateCapabilities, StateSerializer, StateSource } from "./state"
export type {
  StreamFrame,
  StreamTransport,
  StreamTransportContext,
  StreamTransportFactory,
} from "./stream"
