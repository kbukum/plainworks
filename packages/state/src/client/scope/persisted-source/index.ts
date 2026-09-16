"use client"

// Re-export-only barrel for the **persisted-source** concern: the shared string-medium source that
// every storage-backed scope (Web Storage, cookie, URL) composes, plus the versioned-envelope codec
// it uses to stamp and migrate schema versions. No logic here.
export { decodeEnvelope, encodeEnvelope, LEGACY_VERSION } from "./envelope"
export { createStringSource, type StringBackend } from "./string-source"
