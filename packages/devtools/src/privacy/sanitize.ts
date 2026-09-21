import { isRecord, redact } from "@plainworks/std"

/**
 * A value that survives a round trip through any serializable bridge: JSON primitives, arrays, and
 * plain objects only. Every payload the protocol retains or forwards is coerced to this shape so a
 * function, class instance, or cyclic reference can never reach a consumer.
 */
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json }

/** Marker substituted for values that cannot be represented safely. */
const CIRCULAR = "[Circular]"
const TRUNCATED = "[Truncated]"
const FUNCTION = "[Function]"

/**
 * Bounds applied while sanitizing. Every limit has a conservative default so a source that forgets
 * to pass options still cannot flood the panel or leak a deep object graph.
 */
export interface SanitizeOptions {
  /** When set and the value is a record, only these top-level keys are kept. */
  readonly allow?: readonly string[]
  /** Extra sensitive key names to redact, on top of std's built-in vocabulary. */
  readonly redactKeys?: readonly string[]
  /** Maximum object/array nesting before a subtree is dropped. */
  readonly maxDepth?: number
  /** Maximum entries kept per collection before it is truncated. */
  readonly maxItems?: number
  /** Maximum serialized size; an oversized result is replaced with a marker. */
  readonly maxBytes?: number
}

const DEFAULT_MAX_DEPTH = 6
const DEFAULT_MAX_ITEMS = 100
const DEFAULT_MAX_BYTES = 16_384

/**
 * Reduce an arbitrary value to a bounded, redacted, serializable {@link Json} tree. This is the
 * defense-in-depth boundary every source payload crosses before it is retained or forwarded: it
 * masks sensitive keys and token-shaped strings (via std), caps depth and collection size, coerces
 * unsupported values to markers, and replaces an oversized result wholesale. It never throws — a
 * hostile input yields a safe value, not a failure.
 */
export function sanitize(value: unknown, options: SanitizeOptions = {}): Json {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const whitelisted = options.allow ? pick(value, options.allow) : value
  const redactOptions = options.redactKeys
    ? { keys: options.redactKeys, maxDepth, maxItems }
    : { maxDepth, maxItems }
  const redacted = redact(whitelisted, redactOptions)
  const coerced = coerce(redacted, maxDepth, new Set())

  const serialized = JSON.stringify(coerced)
  if (serialized !== undefined && serialized.length > maxBytes) return TRUNCATED
  return coerced
}

/**
 * Strictly test whether `value` is already a serializable {@link Json} tree with no cycles. Unlike
 * {@link sanitize}, this rejects rather than neutralizes: it is the gate for command input, where a
 * mangled or non-serializable payload must be refused, not silently rewritten.
 */
export function isJson(value: unknown, seen: Set<object> = new Set()): value is Json {
  if (value === null) return true
  const type = typeof value
  if (type === "boolean" || type === "string") return true
  if (type === "number") return Number.isFinite(value as number)
  if (Array.isArray(value)) {
    if (seen.has(value)) return false
    seen.add(value)
    const ok = value.every((item) => isJson(item, seen))
    seen.delete(value)
    return ok
  }
  if (isRecord(value) && isPlainObject(value)) {
    if (seen.has(value)) return false
    seen.add(value)
    const ok = Object.values(value).every((item) => isJson(item, seen))
    seen.delete(value)
    return ok
  }
  return false
}

function pick(value: unknown, allow: readonly string[]): unknown {
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const key of allow) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined) Object.defineProperty(result, key, descriptor)
  }
  return result
}

function coerce(value: unknown, depth: number, seen: Set<object>): Json {
  if (value === null) return null
  const type = typeof value
  if (type === "boolean") return value as boolean
  if (type === "string") return value as string
  if (type === "number") return Number.isFinite(value as number) ? (value as number) : null
  if (type === "bigint") return (value as bigint).toString()
  if (type === "function") return FUNCTION
  if (type !== "object") return TRUNCATED

  const object = value as object
  if (seen.has(object)) return CIRCULAR
  if (object instanceof Date) return object.toISOString()
  if (depth <= 0) return TRUNCATED

  seen.add(object)
  try {
    if (Array.isArray(object)) {
      return object.map((item) => coerce(item, depth - 1, seen))
    }
    if (!isPlainObject(object)) return TRUNCATED
    const entries = Object.entries(object as Record<string, unknown>)
    const result: Record<string, Json> = {}
    for (const [key, item] of entries) {
      if (item === undefined) continue
      result[key] = coerce(item, depth - 1, seen)
    }
    return result
  } finally {
    seen.delete(object)
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
