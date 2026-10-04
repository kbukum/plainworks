import type { AuthNavigator } from "../client/navigation"

/**
 * Build the browser {@link AuthNavigator}: full-page `location.assign` navigation and the current
 * location. It reads no cookie or credential. Host access happens only when a method runs, so
 * importing or building it during SSR touches nothing.
 */
export function createFormPostNavigator(): AuthNavigator {
  return {
    navigate: (url) => location.assign(url),
    currentPath: () => `${location.pathname}${location.search}${location.hash}`,
  }
}

/** The shared browser navigator. */
export const formPostNavigator: AuthNavigator = createFormPostNavigator()
