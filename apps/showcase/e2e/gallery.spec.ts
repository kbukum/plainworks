import {
  expectFocusVisible,
  expectNoBrowserAxeViolations,
  settleAnimations,
} from "@plainworks/testkit/browser"
import { COLOR_SCHEMES } from "@plainworks/theme"
import { GALLERY_GROUPS } from "./fixtures/gallery/groups"
import { GALLERY_OVERLAYS, openGalleryGroup, openGalleryOverlay } from "./support/gallery"
import { expect, test } from "./support/gate"

// Component behavior on real layout: every accent scheme's contrast, a visible focus ring on every
// keyboard stop, overlays that open and close, and no looping motion under reduced motion.

// One test per group and scheme, so the scans spread across workers instead of queueing in one.
for (const group of ["form-controls", "feedback"] as const) {
  for (const scheme of COLOR_SCHEMES) {
    test(`${group} meet WCAG AA in the ${scheme} scheme in both modes`, async ({ page }) => {
      await openGalleryGroup(page, group)
      for (const mode of ["light", "dark"] as const) {
        await test.step(mode, async () => {
          await page.evaluate(
            ({ scheme, dark }) => {
              const root = document.documentElement
              for (const name of [...root.classList]) {
                if (name.startsWith("theme-")) root.classList.remove(name)
              }
              root.classList.add(`theme-${scheme}`)
              root.classList.toggle("dark", dark)
            },
            { scheme, dark: mode === "dark" },
          )
          await expectNoBrowserAxeViolations(page)
        })
      }
    })
  }
}

for (const group of GALLERY_GROUPS) {
  test(`every keyboard stop in ${group.id} shows a visible focus indicator`, async ({ page }) => {
    await openGalleryGroup(page, group.id)
    const stops = await page.evaluate(
      () =>
        document.querySelectorAll(
          "main :is(a[href], button, input, select, textarea, [tabindex='0'])",
        ).length,
    )
    for (let index = 0; index < stops; index++) {
      await page.keyboard.press("Tab")
      const inMain = await page.evaluate(
        () => document.activeElement?.closest("main") !== null && document.activeElement !== null,
      )
      if (!inMain) break
      await expectFocusVisible(page)
    }
  })
}

test("every gallery overlay opens from its trigger and closes on Escape", async ({ page }) => {
  let open: string | undefined
  for (const overlay of GALLERY_OVERLAYS) {
    await test.step(overlay.trigger, async () => {
      if (open !== overlay.group) {
        await openGalleryGroup(page, overlay.group)
        open = overlay.group
      }
      await openGalleryOverlay(page, overlay)
      await page.keyboard.press("Escape")
      await page.mouse.move(0, 0)
      await expect(overlay.popup(page).first()).toBeHidden()
    })
  }
})

test("the form shows field and form errors when validation fails", async ({ page }) => {
  await openGalleryGroup(page, "composites")
  await page.getByRole("button", { name: "Submit invalid form" }).click()
  await expect(page.getByText("Enter a valid work email.")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Work email" })).toHaveAttribute(
    "aria-invalid",
    "true",
  )
})

test("toasts appear in the notification region", async ({ page }) => {
  await openGalleryGroup(page, "feedback")
  await page.getByRole("button", { name: "Show toast" }).click()
  const notifications = page.getByRole("region", { name: /^Notifications/ })
  await expect(notifications.getByText("Order saved")).toBeVisible()
  await expect(notifications.getByText("Payment failed")).toBeVisible()
})

test("no gallery group loops an animation under reduced motion", async ({ page }) => {
  for (const group of GALLERY_GROUPS) {
    await openGalleryGroup(page, group.id)
    await settleAnimations(page)
    const looping = await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
          .length,
    )
    expect(looping, `${group.id} looping animations`).toBe(0)
  }
})
