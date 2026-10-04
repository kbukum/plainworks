import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
} from "node:fs"
import { dirname } from "node:path"
import { AuthError } from "@plainworks/auth"

export function alreadyExists(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "EEXIST"
}

/** Create or accept a 0700 directory; reject symlinks and shared permissions. */
export function privateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) {
    throw new AuthError("auth/config", "custody requires a private 0700 directory")
  }
}

/** Ensure SQLite opens a private regular 0600 file, never a symlink or shared file. */
export function privateFile(filename: string): void {
  if (!filename || filename.startsWith("file:")) {
    throw new AuthError("auth/config", "custody needs a plain filename")
  }
  if (filename === ":memory:") return
  privateDirectory(dirname(filename))
  try {
    closeSync(openSync(filename, "wx", 0o600))
  } catch (cause) {
    if (!alreadyExists(cause)) throw cause
  }
  const file = lstatSync(filename)
  if (!file.isFile() || (file.mode & 0o077) !== 0) {
    throw new AuthError("auth/config", "custody requires a private regular 0600 file")
  }
}

/** Read exactly `size` bytes from a private regular file without following symlinks. */
export function readPrivateFile(filename: string, size: number): Uint8Array {
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size !== size) {
      throw new AuthError("auth/config", `custody key requires a private regular ${size}-byte file`)
    }
    return new Uint8Array(readFileSync(fd))
  } finally {
    closeSync(fd)
  }
}
