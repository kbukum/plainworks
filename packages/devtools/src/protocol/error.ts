import { PlainError } from "@plainworks/std"

/**
 * Reasons a devtools message or request is refused. Kinds are stable and machine-readable so a
 * consumer can branch on the failure without matching on prose.
 */
export type ProtocolErrorKind =
  | "devtools/protocol-incompatible"
  | "devtools/message-malformed"
  | "devtools/request-malformed"
  | "devtools/command-input-unsupported"

/**
 * A typed protocol failure. Raised (or returned in an {@link @plainworks/std!Err}) when an envelope
 * cannot be trusted — an incompatible version, a malformed shape, or a non-serializable command
 * input. The offending value is preserved as `cause` for diagnosis, never logged by the protocol.
 */
export class ProtocolError extends PlainError<ProtocolErrorKind> {}
