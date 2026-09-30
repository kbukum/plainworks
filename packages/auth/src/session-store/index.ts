// Re-export-only barrel for the cookie session-store concern: the signed session envelope codec,
// the cookie-backed store, and the revocation registry.
export type { CookieSessionStoreConfig, SessionCookieJar } from "./cookie-store"
export { createCookieSessionStore } from "./cookie-store"
export type { RevocationCheck, SessionCodec, SessionEnvelope } from "./envelope"
export { decodeSession, encodeSession } from "./envelope"
export type { RevocationRegistry, RevocationRegistryOptions } from "./revocation"
export { createRevocationRegistry } from "./revocation"
