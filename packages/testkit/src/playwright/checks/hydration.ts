import { errors, type Page } from "@playwright/test"

/**
 * Count the elements in the page's `main` landmark that React has not hydrated yet. React marks
 * each element it owns with a `__reactFiber$…` own property, and a server-rendered element gains
 * it only when its Suspense boundary hydrates. A page without a `main` landmark reports zero.
 * Runs in the browser, so it names nothing outside its own body.
 */
export function countUnhydrated(): number {
  const main = document.querySelector("main")
  if (main === null) return 0
  const owned = (element: Element): boolean =>
    Object.keys(element).some((key) => key.startsWith("__reactFiber$"))
  return [main, ...main.querySelectorAll("*")].filter((element) => !owned(element)).length
}

/**
 * Wait up to `timeoutMs` for React to hydrate the page's `main` landmark, and report whether it
 * did. The poll runs in the page, so the wait costs no round trips.
 */
export async function waitForHydration(page: Page, timeoutMs: number): Promise<boolean> {
  try {
    // An expression, because the predicate inverts `countUnhydrated` and a function passed to the
    // page cannot reach another module-level function.
    await page.waitForFunction(`(${countUnhydrated.toString()})() === 0`, undefined, {
      timeout: timeoutMs,
      polling: "raf",
    })
    return true
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false
    throw error
  }
}
