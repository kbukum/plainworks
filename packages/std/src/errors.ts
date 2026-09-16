/**
 * Options accepted by every {@link PlainError}. `cause` preserves the original failure so a typed
 * error never discards the root of the problem.
 */
export interface PlainErrorOptions {
  readonly cause?: unknown
}

/**
 * Base typed error for the kit. Every package-specific error extends this so the whole graph shares
 * one shape: a machine-readable `kind` discriminant and a preserved `cause`. Never throw strings —
 * throw (or return) a `PlainError` (or a subclass) instead.
 *
 * `Kind` is a type parameter so a subclass can pin a literal union (e.g.
 * `PlainError<"http" | "parse">`) for exhaustive handling at the call site.
 */
export class PlainError<Kind extends string = string> extends Error {
  /** Stable, machine-readable discriminant for programmatic handling. */
  readonly kind: Kind

  constructor(kind: Kind, message: string, options?: PlainErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    // `new.target` is the concrete constructor invoked, so a subclass reports its own name in stack
    // traces and logs instead of inheriting the literal "PlainError".
    this.name = new.target.name
    this.kind = kind
  }
}

/**
 * Normalize an unknown thrown value into an `Error`, preserving the original as `cause`. Use in
 * `catch` blocks where the caught value is typed `unknown`, so downstream code always has an Error.
 */
export function ensureError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  const message = typeof value === "string" ? value : "Unknown error thrown"
  return new PlainError("std/unknown", message, { cause: value })
}

/** Read a human-readable message from an unknown value without assuming its shape. */
export function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message
  }
  if (typeof value === "string") {
    return value
  }
  return "Unknown error"
}

/** A descriptor-safe structural copy of an error suitable for redaction and diagnostics. */
export interface ErrorSnapshot {
  readonly name: unknown
  readonly message: unknown
  readonly [key: string]: unknown
}

function findErrorDescriptor(target: object, key: string): PropertyDescriptor | undefined {
  const seen = new WeakSet<object>()
  let current: object | null = target
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    try {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (descriptor !== undefined) {
        return descriptor
      }
      current = Object.getPrototypeOf(current)
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Depth beyond which nested diagnostic values collapse to a marker, bounding recursion. */
const MAX_SNAPSHOT_DEPTH = 6

/**
 * Read a descriptor's value without invoking it: an accessor surfaces as `"[Getter]"`, a data value
 * is copied inertly so nested objects cannot smuggle an executable hook into the snapshot.
 */
function inertDescriptor(
  descriptor: PropertyDescriptor | undefined,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (descriptor === undefined) {
    return undefined
  }
  return descriptor.get !== undefined ? "[Getter]" : inertValue(descriptor.value, seen, depth)
}

/**
 * Copy an object's own enumerable fields (plus the standard non-enumerable error fields) by
 * descriptor, never by reference. `seen` breaks reference cycles and `depth` bounds nesting.
 */
function inertObject(value: object, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {}
  let isError = false
  try {
    isError = value instanceof Error
  } catch {
    // A hostile proxy can throw on `instanceof`; treat it as a plain object.
  }
  if (isError) {
    snapshot.name = inertDescriptor(findErrorDescriptor(value, "name"), seen, depth) ?? "Error"
    snapshot.message =
      inertDescriptor(findErrorDescriptor(value, "message"), seen, depth) ?? "Unknown error thrown"
    const stack = inertDescriptor(findErrorDescriptor(value, "stack"), seen, depth)
    if (stack !== undefined) {
      snapshot.stack = stack
    }
  }
  let keys: string[] = []
  try {
    keys = Object.keys(value)
  } catch {
    return snapshot
  }
  for (const key of keys) {
    if (isError && (key === "name" || key === "message" || key === "stack" || key === "cause")) {
      continue
    }
    try {
      snapshot[key] = inertDescriptor(Object.getOwnPropertyDescriptor(value, key), seen, depth)
    } catch {
      snapshot[key] = "[Unavailable]"
    }
  }
  if (isError) {
    const cause = inertDescriptor(findErrorDescriptor(value, "cause"), seen, depth)
    if (cause !== undefined) {
      snapshot.cause = cause
    }
  }
  return snapshot
}

/**
 * Recursively reduce a value to an inert, serialization-safe form: primitives pass through,
 * functions and accessors collapse to markers, and nested objects/arrays are copied so no
 * `toJSON`, getter, or retained function can execute when the snapshot is later serialized.
 */
function inertValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value
  }
  if (typeof value === "function") {
    return "[Function]"
  }
  if (seen.has(value)) {
    return "[Circular]"
  }
  if (depth >= MAX_SNAPSHOT_DEPTH) {
    return "[MaxDepth]"
  }
  seen.add(value)
  if (Array.isArray(value)) {
    const items: unknown[] = []
    for (const item of value) {
      items.push(inertValue(item, seen, depth + 1))
    }
    return items
  }
  return inertObject(value, seen, depth + 1)
}

/**
 * Build a fully inert structural snapshot of a thrown value: standard error fields and enumerable
 * diagnostic fields are copied without invoking accessors, and nested objects/arrays are copied
 * recursively (with cycle and depth guards) so the returned snapshot retains no executable hook and
 * is safe to serialize across an observability boundary. A non-`Error` object keeps its own fields
 * (so discriminants like `kind`/`status` survive); a primitive degrades to a generic shape.
 */
export function createErrorSnapshot(value: unknown): ErrorSnapshot {
  if (value === null || typeof value !== "object") {
    return {
      name: "PlainError",
      message: typeof value === "string" ? value : "Unknown error thrown",
    }
  }
  const seen = new WeakSet<object>([value])
  const snapshot = inertObject(value, seen, 0)
  if (!("name" in snapshot)) {
    snapshot.name = "PlainError"
  }
  if (!("message" in snapshot)) {
    snapshot.message = "Unknown error thrown"
  }
  return snapshot as ErrorSnapshot
}
