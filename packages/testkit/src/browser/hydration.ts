import { expect, type Page } from "@playwright/test"

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
 * Wait until React has hydrated the page's `main` landmark. Server markup is visible before it
 * hydrates, so a check or screenshot can run too early. Playwright's screenshot then sets an inline
 * caret style that hydration reports as a mismatch, and a click does nothing. Skip it for a surface
 * that blocks the client bundle on purpose.
 */
export async function expectHydrated(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(countUnhydrated), {
      message: "the main landmark is hydrated",
    })
    .toBe(0)
}
