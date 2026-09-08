import { AuthError } from "../errors"
import type { AuthCrypto } from "./seam"

/** The subset of the Web Crypto API the default {@link AuthCrypto} needs, resolved from the host at call time. */
interface WebCryptoLike {
  getRandomValues<T extends Uint8Array>(array: T): T
  readonly subtle: {
    digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>
    importKey(
      format: "raw",
      keyData: Uint8Array,
      algorithm: { name: "HMAC"; hash: "SHA-256" },
      extractable: boolean,
      keyUsages: readonly ("sign" | "verify")[],
    ): Promise<unknown>
    sign(algorithm: "HMAC", key: unknown, data: Uint8Array): Promise<ArrayBuffer>
  }
}

/**
 * Resolve the runtime's Web Crypto without assuming a host global exists at import time — the same
 * lazy-global pattern as `@plainworks/std`'s `id.ts`. `crypto.subtle` and `crypto.getRandomValues`
 * are Web Standards present in Node 18+, Deno, edge runtimes, and browsers, but the portability
 * shim deliberately does not declare them (they have host variance), so this is the one place that
 * feature-detects them.
 *
 * @throws {AuthError} `auth/crypto-unavailable` when the runtime exposes no usable Web Crypto.
 */
function resolveWebCrypto(): WebCryptoLike {
  const candidate = (globalThis as { crypto?: unknown }).crypto
  if (
    candidate !== undefined &&
    candidate !== null &&
    typeof (candidate as WebCryptoLike).getRandomValues === "function" &&
    typeof (candidate as { subtle?: unknown }).subtle === "object" &&
    (candidate as { subtle?: unknown }).subtle !== null &&
    typeof (candidate as WebCryptoLike).subtle.digest === "function" &&
    typeof (candidate as WebCryptoLike).subtle.importKey === "function" &&
    typeof (candidate as WebCryptoLike).subtle.sign === "function"
  ) {
    return candidate as WebCryptoLike
  }
  throw new AuthError(
    "auth/crypto-unavailable",
    "Web Crypto (crypto.subtle / crypto.getRandomValues) is unavailable in this runtime; inject an AuthCrypto polyfill",
  )
}

/**
 * The platform-default {@link AuthCrypto}, backed by the host's Web Crypto. Host-independent: it
 * does no work at import time and resolves the `crypto` global lazily on each call, so importing
 * this module never touches the runtime. A host without Web Crypto (older RN) injects its own
 * `AuthCrypto` rather than hard-importing a polyfill into the core.
 */
export function defaultAuthCrypto(): AuthCrypto {
  return {
    async digestSha256(bytes: Uint8Array): Promise<Uint8Array> {
      const digest = await resolveWebCrypto().subtle.digest("SHA-256", bytes)
      return new Uint8Array(digest)
    },
    randomBytes(length: number): Uint8Array {
      const bytes = new Uint8Array(length)
      resolveWebCrypto().getRandomValues(bytes)
      return bytes
    },
    async hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
      const subtle = resolveWebCrypto().subtle
      const cryptoKey = await subtle.importKey(
        "raw",
        key,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      )
      const tag = await subtle.sign("HMAC", cryptoKey, message)
      return new Uint8Array(tag)
    },
  }
}
