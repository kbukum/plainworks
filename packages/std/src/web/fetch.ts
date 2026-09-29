import type { WebFetch } from "./types"

/** The runtime's global `fetch`, read structurally so the lookup names no host type. */
function platformFetch(): WebFetch | undefined {
  const candidate = (globalThis as { fetch?: unknown }).fetch
  return typeof candidate === "function" ? (candidate as WebFetch) : undefined
}

/**
 * Pick the `fetch` a package uses: the configured one, else the runtime's global `fetch`. The
 * global is looked up now, to fail fast, and read again on each call, so a host or test that
 * replaces it later is honored. When neither exists, the error from `onMissing` is thrown, so each
 * package keeps its own typed error and wording.
 */
export function resolveFetch(configured: WebFetch | undefined, onMissing: () => Error): WebFetch {
  if (configured !== undefined) {
    return configured
  }
  if (platformFetch() === undefined) {
    throw onMissing()
  }
  return (input, init) => {
    const current = platformFetch()
    if (current === undefined) {
      return Promise.reject(onMissing())
    }
    return current(input, init)
  }
}
