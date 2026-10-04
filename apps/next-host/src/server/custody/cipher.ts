import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { AuthError } from "@plainworks/auth"

const MAX_PLAINTEXT_BYTES = 65_536
const MAX_CIPHERTEXT_CHARS = 90_000

/** Synchronous AES-256-GCM for bounded records; each record is bound to its context as AAD. */
export interface Cipher {
  seal(context: string, plaintext: string): string
  open(context: string, ciphertext: string): string
  close(): void
}

/** Own a copy of the key until close, then zero it. */
export function createCipher(encryptionKey: Uint8Array): Cipher {
  if (encryptionKey.length !== 32) {
    throw new AuthError("auth/config", "custody encryption needs a 32-byte key")
  }
  const key = Buffer.from(encryptionKey)
  let closed = false
  function assertOpen(): void {
    if (closed) throw new AuthError("auth/store-unavailable", "custody cipher is closed")
  }
  return {
    seal(context, plaintext) {
      assertOpen()
      if (Buffer.byteLength(plaintext) > MAX_PLAINTEXT_BYTES) {
        throw new AuthError("auth/store-unavailable", "custody record exceeds capacity")
      }
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key, nonce)
      cipher.setAAD(Buffer.from(context))
      return Buffer.concat([
        nonce,
        cipher.update(plaintext, "utf8"),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString("base64url")
    },
    open(context, ciphertext) {
      assertOpen()
      try {
        if (ciphertext.length > MAX_CIPHERTEXT_CHARS) throw new Error("ciphertext exceeds limit")
        const bytes = Buffer.from(ciphertext, "base64url")
        if (bytes.length < 28 || bytes.toString("base64url") !== ciphertext) {
          throw new Error("invalid ciphertext encoding")
        }
        const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12))
        decipher.setAAD(Buffer.from(context))
        decipher.setAuthTag(bytes.subarray(-16))
        return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(
          "utf8",
        )
      } catch (cause) {
        throw new AuthError("auth/store-unavailable", "custody authentication failed", { cause })
      }
    },
    close() {
      closed = true
      key.fill(0)
    },
  }
}
