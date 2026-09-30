// Re-export-only barrel for the session-signing seam: the one contract every signer (the HMAC
// signer on `./server`, a KMS-backed signer) implements.
export type { SessionSigner } from "./seam"
