"use client"

import { useMemo, useSyncExternalStore } from "react"

// A media query that no host can evaluate (SSR, RN, a test without a matchMedia fake) reports
// `false` — the mobile-first default — rather than throwing, so a server render is deterministic.
function subscribe(query: string): (onChange: () => void) => () => void {
  return (onChange) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return () => {}
    }
    const list = window.matchMedia(query)
    list.addEventListener("change", onChange)
    return () => list.removeEventListener("change", onChange)
  }
}

function getMatches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia(query).matches
}

/**
 * Track whether a CSS media query currently matches, staying in sync through
 * {@link useSyncExternalStore} so it is tearing-free under concurrent React. The server snapshot is
 * `false` (mobile-first), so SSR and the first client paint agree; component-scoped adaptivity
 * should prefer CSS container queries, and reach for this only when layout must branch in JS.
 */
export function useMediaQuery(query: string): boolean {
  // Memoize the subscription on `query` so `useSyncExternalStore` keeps one stable listener across
  // renders and only re-binds when the query itself changes.
  const subscribeToQuery = useMemo(() => subscribe(query), [query])
  return useSyncExternalStore(
    subscribeToQuery,
    () => getMatches(query),
    () => false,
  )
}
