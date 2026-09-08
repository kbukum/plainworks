// Server-only entry for `@plainworks/auth` — token custody and cookie **minting**. Everything here
// holds or handles server secrets (the session-signing key), so this entry **must never** be
// imported from a `"use client"` module: a dependency-cruiser boundary rule and the package export
// map enforce that. Re-export-only barrel; implementation lives in `server/` concern modules.
// Host-neutral TS (no React/DOM), but quarantined from any client graph.
export type { HmacSignerConfig } from "./server/hmac-signer"
export { hmacSessionSigner } from "./server/hmac-signer"
