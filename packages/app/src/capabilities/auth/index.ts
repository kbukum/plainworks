// Re-export-only barrel for the auth recipe: the neutral resolver a server runs and the client
// capability that seeds the session. The client half carries its own "use client" directive, so a
// server module can import the resolver from here.
export type { AuthCapabilityOptions } from "./provider"
export { createAuthCapability } from "./provider"
export type { AuthResolverOptions } from "./resolver"
export { AUTH_CAPABILITY_ID, createAuthResolver } from "./resolver"
