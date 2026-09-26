import { expect, type Locator, type Page, test } from "@playwright/test"
import { expectNoBrowserAxeViolations, expectReflowAtNarrowViewport } from "./axe"
import { signIn } from "./session"

async function openFixture(page: Page, scenario?: "large"): Promise<void> {
  await page.route("**/inspector-fixture*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Inspector consumer</title><style>main button{min-block-size:2.75rem;margin:0.5rem}</style></head><body><div id="fixture"></div><script type="module" src="/e2e/fixtures/inspector.tsx"></script></body></html>',
    }),
  )
  await page.goto(
    scenario === undefined ? "/inspector-fixture" : `/inspector-fixture?scenario=${scenario}`,
  )
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
  await expectReflowAtNarrowViewport(page)
  await expectNoBrowserAxeViolations(page)
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
  await panel.getByRole("combobox", { name: "Instance" }).selectOption({ label: "Secondary cache" })
  await expect(panel.getByText("Secondary ready", { exact: true })).toBeVisible()
  await expect(panel.getByText("Primary ready", { exact: true })).toBeHidden()
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Fail primary source" }).click()
  await rail.getByRole("button", { name: "Primary cache: Failed" }).click()
  await panel.getByRole("combobox", { name: "Instance" }).selectOption({ label: "Primary cache" })
  await expect(panel.getByRole("alert")).toContainText("Fixture source unavailable")
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
    await expectNoBrowserAxeViolations(page)
    await page.setViewportSize({ width: 320, height: 512 })
    expect(
      await panel.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await expectNoBrowserAxeViolations(page)
    await page.setViewportSize({ width: 1280, height: 800 })
  }
  expect(surfaces.size).toBe(2)
  await page.setViewportSize({ width: 320, height: 512 })
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box?.width).toBeLessThanOrEqual(320)
  await page.keyboard.press("Escape")
  await expectNoBrowserAxeViolations(page)
  expect(
    await page
      .getByRole("region", { name: "Plainworks devtools" })
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(320)
})

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
    // Non-modal: the host stays interactive and reachable while the inspector is open.
    await last.focus()
    await expect(last).toBeFocused()
    await last.scrollIntoViewIfNeeded()
    const host = await box(last)
    expect(overlaps(host, await box(bar)), `bar covers host at ${viewport.width}px`).toBe(false)
    expect(overlaps(host, await box(panel)), `panel covers host at ${viewport.width}px`).toBe(false)
    await last.click()
    await expect(panel).toBeVisible()
    await panel.getByRole("button", { name: "Close inspector" }).click()
    await expect(panel).toHaveCount(0)
  }
})

test("the reservation adds to the host's own root padding", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture(page)
  await page.addStyleTag({ content: "html { padding-inline-end: 32px; padding-block-end: 16px }" })
  // Opening re-publishes the reservation, capturing the host padding now in effect.
  await launcher(page).click()
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  const bar = page.getByRole("region", { name: "Plainworks devtools" })
  const padding = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      inline: Number.parseFloat(style.paddingInlineEnd),
      block: Number.parseFloat(style.paddingBlockEnd),
    }
  })
  expect(padding.inline).toBeCloseTo(32 + (await box(panel)).width, 0)
  expect(padding.block).toBeCloseTo(16 + (await box(bar)).height, 0)
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
    await expectNoBrowserAxeViolations(page)

    await page.keyboard.press("Escape")
    await expect(panel).toHaveCount(0)
  }
})
