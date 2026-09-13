"use client"

/** A `change` handler registered against the fake, in either the modern or legacy shape. */
type MatchMediaListener =
  | EventListenerOrEventListenerObject
  | ((event: MediaQueryListEvent) => unknown)

/** Handle returned by {@link installMatchMedia} for driving the fake at runtime. */
export interface FakeMatchMedia {
  /** Update `matches` and notify every registered `change` listener with the new value. */
  readonly setMatches: (matches: boolean) => void
}

/**
 * Install a deterministic `window.matchMedia` fake, which jsdom does not implement. Client code
 * that reacts to `prefers-color-scheme` / `prefers-reduced-motion` (for example a theme provider)
 * calls `matchMedia` on mount, so a test that renders it must install this first.
 *
 * The returned handle flips the preference at runtime, letting a test assert the component's
 * reaction to a media-query change. The property is `configurable`, so a later install replaces the
 * previous one and jsdom discards it at teardown.
 */
export function installMatchMedia(initialMatches = false): FakeMatchMedia {
  let matches = initialMatches
  const listeners = new Set<MatchMediaListener>()

  const track = (listener: MatchMediaListener | null): void => {
    if (listener) listeners.add(listener)
  }
  const untrack = (listener: MatchMediaListener | null): void => {
    if (listener) listeners.delete(listener)
  }

  // jsdom lacks `MediaQueryList`, so the fake structurally mirrors the parts callers touch; the one
  // assertion keeps the public surface fully typed while faking a global the runtime does not ship.
  const query = (media: string): MediaQueryList =>
    ({
      get matches() {
        return matches
      },
      media,
      onchange: null,
      addEventListener: (type: string, listener: MatchMediaListener | null) => {
        if (type === "change") track(listener)
      },
      removeEventListener: (type: string, listener: MatchMediaListener | null) => {
        if (type === "change") untrack(listener)
      },
      addListener: track,
      removeListener: untrack,
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList

  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: query })

  return {
    setMatches: (next: boolean) => {
      matches = next
      const event = new Event("change") as MediaQueryListEvent
      for (const listener of [...listeners]) {
        if (typeof listener === "function") listener(event)
        else listener.handleEvent(event)
      }
    },
  }
}
