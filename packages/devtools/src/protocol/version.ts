/**
 * The wire version of the neutral devtools protocol. Every envelope crossing a bridge carries this
 * number so a consumer can reject an incompatible peer instead of misreading its messages. Bump it
 * only on a breaking change to a message or request shape.
 */
export const PROTOCOL_VERSION = 1

/**
 * Whether a peer speaking `version` can be trusted by this build. v1 requires an exact match;
 * forward-compatible minor negotiation is deferred until a second version exists.
 */
export function isCompatibleProtocol(version: unknown): version is number {
  return version === PROTOCOL_VERSION
}
