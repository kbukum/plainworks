import { isRecord } from "@plainworks/std"
import { type Json, toBoundedJson } from "@plainworks/std/encoding"
import { redact } from "@plainworks/std/privacy"

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
  /** Maximum serialized size in UTF-8 bytes before the result is replaced with a marker. */
  readonly maxBytes?: number
}

const DEFAULT_MAX_DEPTH = 6
const DEFAULT_MAX_ITEMS = 100
const DEFAULT_MAX_BYTES = 16_384

/**
 * Reduce an arbitrary value to a bounded, redacted, serializable {@link Json} tree. This is the
 * defense-in-depth boundary every source payload crosses before it is retained or forwarded: it
 * first keeps any allowlisted top-level keys, then redacts sensitive keys and token-shaped strings,
 * then delegates JSON coercion and bounds to `@plainworks/std`. It never throws on the value — a
 * hostile input yields a safe marker, not a failure.
 */
export function sanitize(value: unknown, options: SanitizeOptions = {}): Json {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const allowed = options.allow ? pick(value, options.allow) : value
  const redactOptions = options.redactKeys
    ? { keys: options.redactKeys, maxDepth, maxItems }
    : { maxDepth, maxItems }
  return toBoundedJson(redact(allowed, redactOptions), { maxDepth, maxItems, maxBytes })
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
