// Re-export-only barrel for the seam concern: the contracts a host, adapter, or transport
// implements so a higher layer can depend on the shape instead of an implementation. No logic here.
export type {
  AuthContext,
  AuthHeaderProvider,
  AuthHeaders,
  ProtectedSession,
  ProtectedSessionLease,
} from "./auth"
export type { AuthorizationRequest, Authorizer, Decision } from "./authorization"
export type { CacheInvalidateOptions, CacheInvalidator, CacheKey, CacheTarget } from "./cache"
export { isSameCacheKey, matchesCacheTarget } from "./cache"
export type { EventSink, Listener, PlainEvent, Subscription } from "./events"
export type {
  FormArraySchema,
  FormBooleanSchema,
  FormChoice,
  FormFieldSchema,
  FormNumberSchema,
  FormObjectSchema,
  FormSchema,
  FormStringSchema,
} from "./form"
export type { FormFieldMessage, FormFieldMessages, FormFieldsValue } from "./form-fields"
export { createFieldsForm, FormFieldsError } from "./form-fields"
export type { CredentialRestrictions, Identity, SessionIdentity } from "./identity"
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
export type { ReconcilerReport, StateReconciler } from "./state-reconciler"
export { createSourceReconciler } from "./state-reconciler"
export type {
  StreamFrame,
  StreamTransport,
  StreamTransportContext,
  StreamTransportFactory,
} from "./stream"
export type {
  Telemetry,
  TelemetryAttributes,
  TelemetryFailure,
  TelemetryOperation,
  TelemetryValue,
} from "./telemetry"
export { noopTelemetry, toTelemetryFailure } from "./telemetry"
