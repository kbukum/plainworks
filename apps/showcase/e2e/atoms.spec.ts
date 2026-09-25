import { COLOR_SCHEMES } from "@plainworks/theme"
import { expect, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations, expectReflowAtNarrowViewport } from "./axe"

async function openGallery(page: Page): Promise<void> {
  await page.route("**/atoms-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Atom gallery</title></head><body><div id="fixture"></div><script type="module" src="/e2e/fixtures/atoms.tsx"></script></body></html>',
    }),
  )
  await page.goto("/atoms-fixture")
  await expect(page.getByRole("heading", { name: "Atom gallery" })).toBeVisible({ timeout: 30_000 })
}

async function applyTheme(page: Page, scheme: string, dark: boolean): Promise<void> {
  await page.evaluate(
    ({ scheme, dark }) => {
      const root = document.documentElement
      root.className = `theme-${scheme}`
      root.classList.toggle("dark", dark)
    },
    { scheme, dark },
  )
}

test("atoms meet contrast and target size in every scheme and mode", async ({ page }) => {
  await openGallery(page)
  for (const scheme of COLOR_SCHEMES) {
    for (const dark of [false, true]) {
      await test.step(`${scheme} ${dark ? "dark" : "light"}`, async () => {
        await applyTheme(page, scheme, dark)
        await expectNoBrowserAxeViolations(page)
      })
    }
  }
})

// The theme's base focus rule draws an outline; shadcn atoms replace it with a `ring-3` halo whose
// contrast the theme's token test proves. Either is a visible, at-least-2px indicator.
test("every keyboard stop shows a visible focus indicator", async ({ page }) => {
  await openGallery(page)
  const stops = await page.evaluate(
    () =>
      document.querySelectorAll("main :is(button, input, select, textarea, [tabindex='0'])").length,
  )
  for (let index = 0; index < stops; index++) {
    await page.keyboard.press("Tab")
    const focus = await page.evaluate(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || active === document.body) return null
      // Read the settled indicator, not a frame of its transition.
      for (const animation of document.getAnimations()) {
        if (animation instanceof CSSTransition) animation.finish()
      }
      // A visually hidden input (a slider thumb's) shows focus on its visible host, and an input
      // inside a group shows it on the group, which reads as one field.
      let target: HTMLElement = active.closest<HTMLElement>("[data-slot='input-group']") ?? active
      const visuallyHidden = (element: HTMLElement): boolean => {
        const style = getComputedStyle(element)
        return (
          element.getBoundingClientRect().width < 2 ||
          style.clipPath.startsWith("inset(50%") ||
          style.clip === "rect(0px, 0px, 0px, 0px)"
        )
      }
      while (visuallyHidden(target) && target.parentElement !== null) {
        target = target.parentElement
      }
      const style = getComputedStyle(target)
      const rings = [...style.boxShadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)]
      const ring = Math.max(0, ...rings.map(([, spread]) => Number.parseFloat(spread ?? "0")))
      return {
        name: active.getAttribute("aria-label") || active.id || active.textContent,
        width: Math.max(
          style.outlineStyle === "solid" ? Number.parseFloat(style.outlineWidth) : 0,
          ring,
        ),
      }
    })
    if (focus === null) break
    expect(focus.width, `${focus.name} focus width`).toBeGreaterThanOrEqual(2)
  }
})

test("atoms reflow at a 320px viewport", async ({ page }) => {
  await openGallery(page)
  await expectReflowAtNarrowViewport(page)
})

test("looping animations stop under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await openGallery(page)
  const looping = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
        .length,
  )
  expect(looping).toBe(0)
})
