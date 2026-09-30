import { getErrorMessage, isRecord } from "@plainworks/std"
import { escapeJsonForHtml, stringifyJson } from "@plainworks/std/encoding"
import type { DehydratedState } from "@tanstack/query-core"
import { AppConfigError } from "../errors"
import { type AppSnapshot, parseSnapshot } from "../kernel/snapshot"
import { assertTransportableQueryCache, isDehydratedState } from "./dehydrated-state"

/** The default id of the element that carries the {@link HydrationPayload}. */
export const HYDRATION_SCRIPT_ID = "__PLAINWORKS_HYDRATION__"

/**
 * Everything a server render hands to the client so the first client render matches it: the
 * resolved capability snapshot, and the dehydrated query cache when the page prefetched data.
 */
export interface HydrationPayload {
  /** The capability snapshot from `app.resolve(...)`. */
  readonly snapshot: AppSnapshot
  /** The dehydrated query cache, from `@plainworks/query/hydration`'s `dehydrateClient`. */
  readonly query?: DehydratedState
}

/** Options for {@link renderHydrationScript} and {@link readHydration}. */
export interface HydrationScriptOptions {
  /** The element id; defaults to {@link HYDRATION_SCRIPT_ID}. Letters, digits, `_` and `-` only. */
  readonly id?: string
}

/**
 * The one piece of a document {@link readHydration} needs: finding an element's text by id. The
 * browser `document` satisfies it, so the reader stays DOM-free and runs in tests without one.
 */
export interface HydrationDocument {
  getElementById(id: string): { readonly textContent: string | null } | null
}

const SAFE_ID = /^[A-Za-z_][\w-]*$/

function scriptId(options: HydrationScriptOptions): string {
  const id = options.id ?? HYDRATION_SCRIPT_ID
  if (!SAFE_ID.test(id)) {
    throw new AppConfigError(`Invalid hydration script id "${id}": use letters, digits, _ or -.`)
  }
  return id
}

function encode(value: unknown, part: string, omitUndefined: boolean): string {
  try {
    return stringifyJson(value, { omitUndefined })
  } catch (cause) {
    throw new AppConfigError(`Could not serialize the ${part}: ${getErrorMessage(cause)}`, {
      cause,
    })
  }
}

/**
 * Render the payload as one `<script type="application/json">` element for the server's HTML. The
 * JSON is escaped, so resolved text such as `</script>` or `<!--` cannot end the element early.
 * The element is a data block the browser never runs, so a strict Content Security Policy needs
 * no nonce or hash for it.
 *
 * Capability slices must be faithful JSON. A function, `undefined`, BigInt, or cycle fails with an
 * {@link AppConfigError} instead of silently changing what the client sees. The query cache follows
 * TanStack's JSON rules: an `undefined` field is dropped. A pending query — one still awaiting its
 * fetch — carries a live Promise this static payload cannot transport, so it fails with an
 * {@link AppConfigError} rather than shipping empty data the client mistakes for a result.
 *
 * @throws {AppConfigError} When the payload can't be serialized, holds a pending query, or the id
 *   isn't safe.
 */
export function renderHydrationScript(
  payload: HydrationPayload,
  options: HydrationScriptOptions = {},
): string {
  const id = scriptId(options)
  const snapshot = encode(payload.snapshot, "app snapshot", false)
  let query = ""
  if (payload.query !== undefined) {
    assertTransportableQueryCache(payload.query)
    query = `,"query":${encode(payload.query, "query state", true)}`
  }
  const json = escapeJsonForHtml(`{"snapshot":${snapshot}${query}}`)
  return `<script type="application/json" id="${id}">${json}</script>`
}

function parsePayload(text: string): HydrationPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new AppConfigError("Could not parse the hydration payload: malformed JSON.", { cause })
  }
  if (!isRecord(parsed)) {
    throw new AppConfigError("Malformed hydration payload: expected an object.")
  }
  const snapshot = parseSnapshot(parsed.snapshot)
  if (parsed.query === undefined) {
    return { snapshot }
  }
  if (!isDehydratedState(parsed.query)) {
    throw new AppConfigError("Malformed hydration payload: invalid query state.")
  }
  return { snapshot, query: parsed.query }
}

/**
 * Read and validate the payload {@link renderHydrationScript} wrote. The markup is a trust
 * boundary, so a missing element or a malformed payload fails with an {@link AppConfigError}
 * rather than hydrating from made-up state. Pass the browser `document`.
 *
 * @throws {AppConfigError} When the element is missing or empty, or the payload is malformed.
 */
export function readHydration(
  document: HydrationDocument,
  options: HydrationScriptOptions = {},
): HydrationPayload {
  const id = scriptId(options)
  const text = document.getElementById(id)?.textContent
  if (text === undefined || text === null || text.length === 0) {
    throw new AppConfigError(`Missing hydration payload #${id}: the server did not render it.`)
  }
  return parsePayload(text)
}
