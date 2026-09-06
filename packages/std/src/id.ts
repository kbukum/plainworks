import { PlainError } from "./errors"

/** The subset of the Web Crypto API this module needs, resolved from the host at call time. */
interface RandomUuidSource {
  randomUUID(): string
}

/**
 * Resolve the runtime's Web Crypto implementation without assuming a host global exists at import time. `crypto.randomUUID` is a Web Standard present in Node, Deno, edge runtimes, and browsers.
 */
function getRandomUuidSource(): RandomUuidSource {
  const candidate = (globalThis as { crypto?: { randomUUID?: unknown } }).crypto
  if (candidate !== undefined && typeof candidate.randomUUID === "function") {
    return candidate as RandomUuidSource
  }
  throw new PlainError("std/unsupported", "Web Crypto randomUUID is unavailable in this runtime")
}

/**
 * Generate a random RFC 4122 v4 identifier using the host's Web Crypto. Host-independent: it performs no work at import time and resolves the `crypto` global lazily on each call, so importing this module never touches the runtime.
 *
 * @throws {PlainError} `std/unsupported` when the runtime exposes no Web Crypto `randomUUID`.
 */
export function randomId(): string {
  return getRandomUuidSource().randomUUID()
}

/**
 * Generate an idempotency key: a fresh random identifier a caller attaches to a write so the server can dedupe safe retries of that write. Generate the key **once per logical write** and reuse the same value across every retry of that write — calling this inside each attempt mints a new key per try and defeats server-side deduplication. A semantic alias over {@link randomId} — the name documents the intent at the call site.
 *
 * @throws {PlainError} `std/unsupported` when the runtime exposes no Web Crypto `randomUUID`.
 */
export function idempotencyKey(): string {
  return randomId()
}
