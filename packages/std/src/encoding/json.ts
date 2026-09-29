import { PlainError } from "../errors"
import { isNonNegativeInteger, isPositiveInteger } from "../guard"
import { utf8ByteLength } from "./utf8"

/** A JSON value: primitives, arrays, and plain objects, with finite numbers only. */
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json }

/** A value could not be serialized to JSON without losing or changing part of it. */
export class JsonEncodeError extends PlainError<"std/json-encode"> {
  constructor(message: string, options?: { cause?: unknown }) {
    super("std/json-encode", message, options)
  }
}

/**
 * Whether `value` is already a JSON value with no cycles. It rejects anything `JSON.stringify`
 * would drop or change: `undefined`, functions, symbols, BigInts, non-finite numbers, sparse
 * arrays, objects that are not plain, and a hidden (non-enumerable) `toJSON` that would rewrite the
 * value. It never runs a getter; an accessor property fails the check, and a proxy trap that throws
 * yields `false`. Use it to refuse untrusted input rather than repair it.
 */
export function isJson(value: unknown): value is Json {
  try {
    return isJsonValue(value, new Set())
  } catch {
    return false
  }
}

function isJsonValue(value: unknown, path: Set<object>): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return true
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
  }
  if (typeof value !== "object" || path.has(value)) {
    return false
  }
  const isArray = Array.isArray(value)
  if (!isArray && !isPlainObject(value)) {
    return false
  }
  const toJson = Object.getOwnPropertyDescriptor(value, "toJSON")
  if (toJson !== undefined && toJson.enumerable !== true) {
    return false
  }
  path.add(value)
  try {
    const keys = isArray ? Array.from({ length: value.length }, (_, index) => `${index}`) : null
    for (const key of keys ?? Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !("value" in descriptor)) {
        return false
      }
      if (!isJsonValue(descriptor.value, path)) {
        return false
      }
    }
    return true
  } finally {
    path.delete(value)
  }
}

/** Options for {@link stringifyJson}. */
export interface StringifyJsonOptions {
  /**
   * Leave out object properties whose value is `undefined`, as `JSON.stringify` does. Off by
   * default, so a missing value is an error rather than a silently absent field.
   */
  readonly omitUndefined?: boolean
}

/**
 * Serialize `value` to JSON, or throw. Unlike `JSON.stringify`, it never silently drops or changes
 * a value: a function, symbol, BigInt, non-finite number, `undefined` (see
 * {@link StringifyJsonOptions.omitUndefined}), or cycle throws a {@link JsonEncodeError}. A
 * `toJSON` method, such as `Date`'s, still applies.
 *
 * @throws {JsonEncodeError} When `value` is not faithfully serializable; a native error is kept as
 *   `cause`.
 */
export function stringifyJson(value: unknown, options: StringifyJsonOptions = {}): string {
  const omitUndefined = options.omitUndefined === true
  // `JSON.stringify` calls the replacer for the root value first; only later calls are properties.
  let isRoot = true
  function rejectLossy(this: unknown, key: string, item: unknown): unknown {
    const atRoot = isRoot
    isRoot = false
    if (item === undefined) {
      if (omitUndefined && !atRoot && !Array.isArray(this)) {
        return undefined
      }
      throw lossyValue(atRoot ? null : key, "undefined")
    }
    if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
      throw lossyValue(atRoot ? null : key, typeof item)
    }
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw lossyValue(atRoot ? null : key, String(item))
    }
    return item
  }
  let json: string | undefined
  try {
    json = JSON.stringify(value, rejectLossy)
  } catch (cause) {
    if (cause instanceof JsonEncodeError) {
      throw cause
    }
    throw new JsonEncodeError("Value is not JSON-serializable (for example, it has a cycle)", {
      cause,
    })
  }
  if (json === undefined) {
    throw lossyValue(null, typeof value)
  }
  return json
}

function lossyValue(key: string | null, kind: string): JsonEncodeError {
  const where = key === null ? "at the top level" : `at key "${key}"`
  return new JsonEncodeError(`Value is not JSON-serializable: ${kind} ${where}`)
}

// Inert inside a JSON string, but hostile once the JSON is inlined in an HTML `<script>`: `<` can
// close the element, and U+2028/U+2029 end a line inside a JavaScript string literal.
const HTML_UNSAFE = /[<>&\u2028\u2029]/g
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
}

/**
 * Make serialized JSON safe to inline in an HTML `<script>` element. The escapes keep the JSON
 * value identical, so `JSON.parse` returns the same data, while an embedded `</script>` can no
 * longer break out of the element.
 */
export function escapeJsonForHtml(json: string): string {
  return json.replace(HTML_UNSAFE, (char) => HTML_ESCAPES[char] ?? char)
}

/** Limits for {@link toBoundedJson}. Every limit has a default, so no call is unbounded. */
export interface BoundedJsonOptions {
  /** Nesting depth kept before a subtree becomes `"[Truncated]"`. Defaults to `6`. */
  readonly maxDepth?: number
  /** Entries kept per array or object. Defaults to `100`. */
  readonly maxItems?: number
  /** Serialized UTF-8 size kept before the whole result becomes `"[Truncated]"`. Defaults to 16 KiB. */
  readonly maxBytes?: number
}

const CIRCULAR = "[Circular]"
const TRUNCATED = "[Truncated]"
const FUNCTION = "[Function]"
const GETTER = "[Getter]"

/**
 * Reduce any value to a bounded {@link Json} tree that is safe to keep, show, or send. It caps
 * depth, entries, and size, replaces what JSON can't hold with a marker (`"[Circular]"`,
 * `"[Function]"`, `"[Getter]"`, `"[Truncated]"`), turns a BigInt into a string and a `Date` into
 * an ISO string, and never runs a getter or `toJSON`. It never throws on the value; a hostile one
 * yields a marker. It does not redact: pass the value through `redact` first when it may hold
 * secrets.
 *
 * @throws {RangeError} When a limit is invalid.
 */
export function toBoundedJson(value: unknown, options: BoundedJsonOptions = {}): Json {
  const maxDepth = options.maxDepth ?? 6
  const maxItems = options.maxItems ?? 100
  const maxBytes = options.maxBytes ?? 16_384
  if (!isNonNegativeInteger(maxDepth) || !isNonNegativeInteger(maxItems)) {
    throw new RangeError("toBoundedJson requires maxDepth and maxItems to be non-negative integers")
  }
  if (!isPositiveInteger(maxBytes)) {
    throw new RangeError("toBoundedJson requires maxBytes to be a positive integer")
  }
  const walk: Walk = { maxItems, path: new Set(), remaining: maxBytes }
  const bounded = coerce(value, maxDepth, walk)
  if (walk.remaining < 0) {
    return TRUNCATED
  }
  // The running budget counts strings without escapes, so confirm the exact size once.
  return utf8ByteLength(JSON.stringify(bounded)) > maxBytes ? TRUNCATED : bounded
}

/**
 * State shared across one {@link toBoundedJson} traversal. `remaining` is the byte budget left; it
 * is spent as values are kept, and once it goes negative the walk stops reading the input.
 */
interface Walk {
  readonly maxItems: number
  readonly path: Set<object>
  remaining: number
}

function spend(walk: Walk, bytes: number): boolean {
  walk.remaining -= bytes
  return walk.remaining >= 0
}

/** Keep a leaf, charging its serialized size (strings without escapes) to the budget. */
function keepLeaf(walk: Walk, leaf: string | number | boolean | null): Json {
  spend(walk, typeof leaf === "string" ? utf8ByteLength(leaf) + 2 : String(leaf).length)
  return leaf
}

function coerce(value: unknown, depth: number, walk: Walk): Json {
  if (walk.remaining < 0) {
    return TRUNCATED
  }
  switch (typeof value) {
    case "boolean":
    case "string":
      return keepLeaf(walk, value)
    case "number":
      return keepLeaf(walk, Number.isFinite(value) ? value : null)
    case "bigint":
      return keepLeaf(walk, value.toString())
    case "function":
      return keepLeaf(walk, FUNCTION)
    case "object":
      break
    default:
      return keepLeaf(walk, TRUNCATED)
  }
  if (value === null) {
    return keepLeaf(walk, null)
  }
  if (walk.path.has(value)) {
    return keepLeaf(walk, CIRCULAR)
  }
  try {
    if (value instanceof Date) {
      const time = Date.prototype.getTime.call(value)
      return keepLeaf(walk, Number.isFinite(time) ? new Date(time).toISOString() : null)
    }
    if (depth <= 0) {
      return keepLeaf(walk, TRUNCATED)
    }
    walk.path.add(value)
    try {
      return Array.isArray(value)
        ? coerceArray(value, depth, walk)
        : isPlainObject(value)
          ? coerceObject(value, depth, walk)
          : keepLeaf(walk, TRUNCATED)
    } finally {
      walk.path.delete(value)
    }
  } catch {
    // A proxy trap or exotic object that throws while being read is reported, not propagated.
    return keepLeaf(walk, TRUNCATED)
  }
}

function coerceArray(value: readonly unknown[], depth: number, walk: Walk): Json[] {
  const kept = Math.min(value.length, walk.maxItems)
  const items: Json[] = []
  spend(walk, 2)
  for (let index = 0; index < kept && spend(walk, 1); index++) {
    items.push(coerceProperty(value, `${index}`, depth, walk) ?? keepLeaf(walk, null))
  }
  if (value.length > kept) {
    items.push(keepLeaf(walk, `[+${value.length - kept} more]`))
  }
  return items
}

function coerceObject(value: object, depth: number, walk: Walk): { [key: string]: Json } {
  const result: { [key: string]: Json } = {}
  let count = 0
  spend(walk, 2)
  for (const key of Object.keys(value)) {
    if (count >= walk.maxItems || !spend(walk, utf8ByteLength(key) + 4)) {
      break
    }
    const item = coerceProperty(value, key, depth, walk)
    if (item !== undefined) {
      // Define, never assign: assigning an own `__proto__` key would replace the prototype.
      Object.defineProperty(result, key, {
        value: item,
        enumerable: true,
        writable: true,
        configurable: true,
      })
      count += 1
    }
  }
  return result
}

/** Coerce one own property from its descriptor, so an accessor is reported, never invoked. */
function coerceProperty(owner: object, key: string, depth: number, walk: Walk): Json | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(owner, key)
  if (descriptor === undefined) {
    return undefined
  }
  if (!("value" in descriptor)) {
    return keepLeaf(walk, GETTER)
  }
  return descriptor.value === undefined ? undefined : coerce(descriptor.value, depth - 1, walk)
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
