import type { WebHeaders, WebHeadersInit } from "./types"

function isPairs(value: WebHeadersInit): value is readonly (readonly [string, string])[] {
  return Array.isArray(value)
}

function isHeaders(value: WebHeadersInit): value is WebHeaders {
  return "get" in value && typeof value.get === "function"
}

/** Copy structural headers without requiring a host-specific Headers initializer type. */
export function createHeaders(initial?: WebHeadersInit): WebHeaders {
  const headers = new Headers()
  if (initial === undefined) return headers
  if (isPairs(initial)) {
    for (const [key, value] of initial) headers.append(key, value)
  } else if (isHeaders(initial)) {
    initial.forEach((value, key) => {
      headers.append(key, value)
    })
  } else {
    for (const [key, value] of Object.entries(initial)) headers.append(key, value)
  }
  return headers
}
