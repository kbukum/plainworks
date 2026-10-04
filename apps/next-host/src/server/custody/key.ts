import { hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join } from "node:path"
import { AuthError } from "@plainworks/auth"
import { alreadyExists, privateDirectory, readPrivateFile } from "./files"

export interface RootKeyOptions {
  readonly filename: string
  /** Canonical base64url encoding of exactly 32 random bytes. Required outside local demo mode. */
  readonly configured?: string | undefined
  /** Explicit local-demo first-run permission; never enable for production secret initialization. */
  readonly allowCreate?: boolean
}

/**
 * Read the configured root key or initialize a local-demo one. Publish by hard link only after the
 * complete private file is flushed, so concurrent first runs cannot read a partial key. A missing
 * key beside existing state fails closed; this never resets persistent data.
 */
export function resolveRootKey(options: RootKeyOptions): Uint8Array {
  if (!options.filename || (!options.configured && !options.allowCreate)) {
    throw new AuthError("auth/config", "a configured custody root key is required")
  }
  const directory = dirname(options.filename)
  privateDirectory(directory)
  if (options.configured !== undefined) {
    const configured = Buffer.from(options.configured, "base64url")
    if (configured.length !== 32 || configured.toString("base64url") !== options.configured) {
      throw new AuthError("auth/config", "configured root key must encode 32-byte key material")
    }
    if (
      existsSync(options.filename) &&
      !timingSafeEqual(configured, readPrivateFile(options.filename, 32))
    ) {
      throw new AuthError("auth/config", "configured root key mismatch")
    }
    return new Uint8Array(configured)
  }
  if (existsSync(options.filename)) return readPrivateFile(options.filename, 32)
  const prefix = `.${basename(options.filename)}.pending-`
  if (
    readdirSync(directory).some(
      (name) => name !== basename(options.filename) && !name.startsWith(prefix),
    )
  ) {
    throw new AuthError("auth/config", "missing root key beside existing private state")
  }
  const pending = join(directory, `${prefix}${randomBytes(16).toString("hex")}`)
  const fd = openSync(pending, "wx", 0o600)
  try {
    writeFileSync(fd, randomBytes(32))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    try {
      linkSync(pending, options.filename)
      const parent = openSync(directory, constants.O_RDONLY)
      try {
        fsyncSync(parent)
      } finally {
        closeSync(parent)
      }
    } catch (cause) {
      if (!alreadyExists(cause)) throw cause
    }
    return readPrivateFile(options.filename, 32)
  } finally {
    unlinkSync(pending)
  }
}

/** Domain-separated subkey for one custody purpose. */
export function deriveKey(root: Uint8Array, purpose: string): Uint8Array {
  if (root.length !== 32 || !purpose || purpose.length > 128) {
    throw new AuthError("auth/config", "key derivation requires a 32-byte root and a purpose")
  }
  return new Uint8Array(hkdfSync("sha256", root, "plainworks:sqlite:v1", purpose, 32))
}
