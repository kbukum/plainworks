import { pressWithKeyboard } from "@plainworks/testkit/browser"
import type { Locator, Page } from "@playwright/test"
import { expectFocusVisible, expectNoAxeViolations, expectReflow } from "./support/checks"
import { openFixturePage } from "./support/fixture-page"
import { expect, test } from "./support/gate"
import { signIn } from "./support/session"

async function openFixture(page: Page, scenario?: "large"): Promise<void> {
  await openFixturePage(page, "inspector", scenario === undefined ? "" : `?scenario=${scenario}`)
  await expect(launcher(page)).toBeVisible()
}

function launcher(page: Page): Locator {
  return page.getByRole("region", { name: "Plainworks devtools" }).getByRole("button", {
    name: "Inspect",
  })
}

function inspector(page: Page): Locator {
  return page.getByRole("region", { name: "Plainworks inspector" })
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const rect = await locator.boundingBox()
  if (rect === null) throw new Error("Expected a rendered element")
  return rect
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

test("consumer discovers instances, isolates failure, reports overflow, and cleans up", async ({
  page,
}) => {
  await openFixture(page)
  await expectReflow(page)
  await expectNoAxeViolations(page)
  // The package stylesheet is scoped to the devtools root: host elements keep browser defaults.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "32px")
  const rail = page.getByRole("region", { name: "Plainworks devtools" })
  await rail.getByRole("button", { name: "Show 1 more diagnostic" }).click()
  const discovery = inspector(page)
  await expect(discovery.getByRole("list", { name: "Sources" }).getByRole("listitem")).toHaveCount(
    2,
  )
  await page.keyboard.press("Escape")
  await rail.getByRole("button", { name: "Cache health: degraded" }).click()
  const panel = inspector(page)
  await expect(panel.getByRole("tab", { name: "fixture", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(panel.getByText("Primary ready", { exact: true })).toBeVisible()
  await expectNoAxeViolations(page)
  await panel.getByRole("combobox", { name: "Instance" }).selectOption({ label: "Secondary cache" })
  await expect(panel.getByText("Secondary ready", { exact: true })).toBeVisible()
  await expect(panel.getByText("Primary ready", { exact: true })).toBeHidden()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Fail primary source" }).click()
  await rail.getByRole("button", { name: "Primary cache: Failed" }).click()
  await panel.getByRole("combobox", { name: "Instance" }).selectOption({ label: "Primary cache" })
  await expect(panel.getByRole("alert")).toContainText("Fixture source unavailable")
  await expectNoAxeViolations(page)
  await panel.getByRole("tab", { name: "fixture", exact: true }).click()
  await panel.getByRole("combobox", { name: "Instance" }).selectOption({ label: "Secondary cache" })
  await expect(panel.getByText("Secondary ready", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Emit burst" }).click()
  await rail.getByRole("button", { name: /Timeline: .* dropped/ }).click()
  await expect(panel.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(panel.getByRole("list", { name: "Events" }).getByRole("listitem")).toHaveCount(500)
  await panel.getByRole("button", { name: "Pause", exact: true }).click()
  await panel.getByRole("button", { name: "Resume", exact: true }).click()
  await expect(panel.getByRole("list", { name: "Events" }).getByRole("listitem")).toHaveCount(3)
  await panel.getByRole("tab", { name: "Overview" }).click()
  await expect(panel.getByText(/events dropped — retention is bounded/)).toBeVisible()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Dispose inspector" }).click()
  await expect(page.getByRole("status")).toHaveText("Disposed 2 sources")
  await expect(rail).toHaveCount(0)
  await expect(launcher(page)).toHaveCount(0)
  await expect(page.locator("html")).toHaveCSS("padding-bottom", "0px")
  await expect(page.locator("html")).not.toHaveAttribute("data-plainworks-devtools-docked")
  await page.keyboard.press("ControlOrMeta+Shift+d")
  await expect(panel).toHaveCount(0)
})

test("rail, inspector, and custom commands are accessible and responsive", async ({ page }) => {
  await signIn(page)
  const trigger = launcher(page)
  await trigger.focus()
  await page.keyboard.press("Enter")
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  await panel.getByRole("tab", { name: "mock", exact: true }).click()
  const errorSwitch = panel.getByRole("switch", { name: "Simulate API errors" })
  await errorSwitch.click()
  await expect(errorSwitch).toBeChecked()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeFocused()
  await page
    .getByRole("list", { name: "Diagnostics" })
    .getByRole("button", { name: "Mock errors: on" })
    .click()
  await expect(panel.getByRole("tab", { name: "mock", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await errorSwitch.click()
  await expect(errorSwitch).not.toBeChecked()

  await panel.getByRole("button", { name: "Reset mock data" }).click()
  const confirmation = page.getByRole("alertdialog", { name: "Reset mock data?" })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole("button", { name: "Cancel" }).click()
  await expect(confirmation).toBeHidden()
  await panel.getByRole("button", { name: "Reset mock data" }).click()
  await confirmation.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(panel.getByRole("status")).toHaveText("Mock data reset")

  const surfaces = new Set<string>()
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    await page.locator("html").evaluate((element, dark) => {
      element.classList.toggle("dark", dark)
    }, colorScheme === "dark")
    // The host's mode class reaches the inspector's scoped theme tokens.
    surfaces.add(await panel.evaluate((element) => getComputedStyle(element).backgroundColor))
    await expectNoAxeViolations(page)
    await page.setViewportSize({ width: 320, height: 512 })
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await expectNoAxeViolations(page)
    await page.setViewportSize({ width: 1280, height: 800 })
  }
  expect(surfaces.size).toBe(2)
  await page.setViewportSize({ width: 320, height: 512 })
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box?.width).toBeLessThanOrEqual(320)
  await page.keyboard.press("Escape")
  await expectNoAxeViolations(page)
  expect(
    await page
      .getByRole("region", { name: "Plainworks devtools" })
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(320)
})

// The showcase registers no channel source; the Next host's inspector covers the channel panel.
const INSPECTOR_TABS = ["Overview", "Timeline", "mock", "http", "query"] as const

test("every inspector tab meets WCAG AA in light and dark", async ({ page }) => {
  await signIn(page)
  await launcher(page).click()
  const panel = inspector(page)
  for (const tab of INSPECTOR_TABS) {
    const trigger = panel.getByRole("tab", { name: tab, exact: true })
    await trigger.click()
    await expect(trigger).toHaveAttribute("aria-selected", "true")
    for (const dark of [false, true]) {
      await test.step(`${tab} ${dark ? "dark" : "light"}`, async () => {
        await page.locator("html").evaluate((root, on) => root.classList.toggle("dark", on), dark)
        await expectNoAxeViolations(page)
      })
    }
  }
})

test("the reset confirmation opens from the keyboard with visible focus", async ({ page }) => {
  await signIn(page)
  await launcher(page).click()
  await inspector(page).getByRole("tab", { name: "mock", exact: true }).click()
  await pressWithKeyboard(inspector(page).getByRole("button", { name: "Reset mock data" }))
  await expect(page.getByRole("alertdialog", { name: "Reset mock data?" })).toBeVisible()
  await expectFocusVisible(page)
  await expectNoAxeViolations(page)
})

const SIDES = ["bottom", "left", "right"] as const

async function dockTo(page: Page, side: (typeof SIDES)[number]): Promise<void> {
  const option = inspector(page).getByRole("button", { name: `Dock to ${side}` })
  await option.click()
  await expect(option).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator("html")).toHaveAttribute("data-plainworks-devtools-docked", side)
}

test("the docked inspector sits beside the host and never blocks it", async ({ page }) => {
  await openFixture(page)
  const bar = page.getByRole("region", { name: "Plainworks devtools" })
  const last = page.getByRole("button", { name: "Last host control" })

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport)
    await launcher(page).click()
    const panel = inspector(page)
    await expect(panel).toBeVisible()
    // Side docks need a 48rem viewport; below it the devtools stay at the bottom.
    const sides = viewport.width >= 768 ? SIDES : (["bottom"] as const)
    if (viewport.width < 768) {
      await expect(panel.getByRole("group", { name: "Dock side" })).toHaveCount(0)
    }
    for (const side of sides) {
      if (viewport.width >= 768) await dockTo(page, side)
      // Non-modal: the host stays interactive and reachable while the inspector is open.
      await last.focus()
      await expect(last).toBeFocused()
      await last.scrollIntoViewIfNeeded()
      const host = await box(last)
      const where = `${side} at ${viewport.width}px`
      expect(overlaps(host, await box(bar)), `bar covers host, ${where}`).toBe(false)
      expect(overlaps(host, await box(panel)), `panel covers host, ${where}`).toBe(false)
      await last.click()
      await expect(panel).toBeVisible()
    }
    if (viewport.width >= 768) await dockTo(page, "bottom")
    await panel.getByRole("button", { name: "Close inspector" }).click()
    await expect(panel).toHaveCount(0)
  }
})

test("the reservation follows the dock side and adds to the host's own padding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture(page)
  await page.addStyleTag({
    content: "html { padding: 0 32px 16px 24px; scroll-padding: 0 8px 4px 2px }",
  })
  // Opening re-publishes the reservation, capturing the host padding now in effect.
  await launcher(page).click()
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  const bar = page.getByRole("region", { name: "Plainworks devtools" })
  const reserved = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      return {
        bottom: Number.parseFloat(style.paddingBottom),
        left: Number.parseFloat(style.paddingLeft),
        right: Number.parseFloat(style.paddingRight),
        scrollRight: Number.parseFloat(style.scrollPaddingRight),
      }
    })

  let padding = await reserved()
  expect(padding.bottom).toBeCloseTo(16 + (await box(bar)).height + (await box(panel)).height, 0)
  expect(padding).toMatchObject({ left: 24, right: 32, scrollRight: 8 })

  await dockTo(page, "right")
  padding = await reserved()
  expect(padding.right).toBeCloseTo(32 + (await box(bar)).width + (await box(panel)).width, 0)
  expect(padding.scrollRight).toBeCloseTo(8 + (await box(bar)).width + (await box(panel)).width, 0)
  expect(padding).toMatchObject({ bottom: 16, left: 24 })

  await dockTo(page, "left")
  padding = await reserved()
  expect(padding.left).toBeCloseTo(24 + (await box(bar)).width + (await box(panel)).width, 0)
  expect(padding).toMatchObject({ bottom: 16, right: 32 })

  // Closing keeps only the bar's strip.
  await panel.getByRole("button", { name: "Close inspector" }).click()
  padding = await reserved()
  expect(padding.left).toBeCloseTo(24 + (await box(bar)).width, 0)
})

test("the user moves and resizes the devtools, and the layout survives a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture(page)
  await launcher(page).click()
  const panel = inspector(page)
  const handle = panel.getByRole("separator", { name: "Resize inspector" })

  // Keyboard: the splitter follows the WAI-ARIA window splitter pattern.
  await dockTo(page, "right")
  await expect(panel.getByRole("button", { name: "Dock to right" })).toBeFocused()
  await expect(handle).toHaveAttribute("aria-orientation", "vertical")
  const start = Number(await handle.getAttribute("aria-valuenow"))
  await handle.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(handle).toHaveAttribute("aria-valuenow", String(start + 16))
  await expect.poll(async () => (await box(panel)).width).toBeCloseTo(start + 16, 0)
  await page.keyboard.press("Home")
  await expect(handle).toHaveAttribute("aria-valuenow", "320")
  await expect(handle).toBeFocused()

  // Pointer: dragging the handle toward the host grows the panel, committed on release.
  const grip = await box(handle)
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 - 120, grip.y + grip.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(handle).toHaveAttribute("aria-valuenow", "440")
  expect((await box(panel)).width).toBeCloseTo(440, 0)

  await page.reload()
  await expect(launcher(page)).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("data-plainworks-devtools-docked", "right")
  await launcher(page).click()
  await expect(handle).toHaveAttribute("aria-valuenow", "440")
  expect((await box(panel)).width).toBeCloseTo(440, 0)
})

test("every dock side is accessible and keeps the page reflowable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture(page)
  await launcher(page).click()
  const panel = inspector(page)
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" })
    await page.locator("html").evaluate((element, dark) => {
      element.classList.toggle("dark", dark)
    }, colorScheme === "dark")
    for (const side of SIDES) {
      await dockTo(page, side)
      await expectNoAxeViolations(page)
      // Each dock control keeps a target of at least 24×24 CSS px.
      for (const control of [
        panel.getByRole("button", { name: `Dock to ${side}` }),
        panel.getByRole("separator", { name: "Resize inspector" }),
        launcher(page),
      ]) {
        const rect = await box(control)
        expect(Math.min(rect.width, rect.height), `${side} ${colorScheme}`).toBeGreaterThanOrEqual(
          24,
        )
      }
    }
  }
  await dockTo(page, "right")
  // Reflow: a narrow viewport drops the side dock to the bottom, once its resize is handled, and
  // then the page has no horizontal scroll.
  await page.setViewportSize({ width: 320, height: 568 })
  await expect(page.locator("html")).toHaveAttribute("data-plainworks-devtools-docked", "bottom")
  await expectReflow(page)
  await expect(panel).toBeVisible()
  expect((await box(panel)).width).toBeLessThanOrEqual(320)
})

test("the inspector keeps a stable layout under production-sized data", async ({ page }) => {
  await openFixture(page, "large")
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport)
    await launcher(page).click()
    const panel = inspector(page)
    await panel.getByRole("tab", { name: "Timeline" }).click()
    const events = panel.getByRole("list", { name: "Events" })
    await expect(events.getByRole("listitem")).toHaveCount(500)

    // Only the content scrolls: the header and tab strip keep their full height.
    const tabs = panel.getByRole("tablist")
    const tab = panel.getByRole("tab", { name: "Timeline" })
    await events.getByRole("listitem").last().scrollIntoViewIfNeeded()
    expect((await box(tabs)).height).toBeGreaterThanOrEqual((await box(tab)).height)
    await expect(panel.getByRole("heading", { name: "Plainworks inspector" })).toBeInViewport()
    await expect(tab).toBeInViewport()

    // Nothing overflows sideways; long labels wrap across the full row, not a sliver of it.
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    const row = events.getByRole("listitem").first()
    const label = row.getByText(/^POST https:/)
    expect((await box(label)).width).toBeGreaterThan((await box(row)).width * 0.8)

    // Detail with long values stays inside the panel too.
    await row.getByRole("button", { name: /^Details for/ }).click()
    await expect(row.getByText(/x-request-id/)).toBeVisible()
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)

    // Many sources: the tab strip scrolls inline instead of wrapping or squeezing.
    const lastTab = panel.getByRole("tab", { name: "observability", exact: true })
    await lastTab.click()
    await expect(lastTab).toHaveAttribute("aria-selected", "true")
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await expectNoAxeViolations(page)

    await page.keyboard.press("Escape")
    await expect(panel).toHaveCount(0)
  }
})
