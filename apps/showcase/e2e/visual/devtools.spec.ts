import {
  COMPACT_MATRIX,
  DIALOG_MATRIX,
  FULL_MATRIX,
  planVisualTests,
  pressWithKeyboard,
  runVisualTest,
  VISUAL_TAG,
  type VisualSurface,
} from "@plainworks/testkit/browser"
import type { Page } from "@playwright/test"
import { appRoute, openRoute } from "../support/app"
import { openFixturePage } from "../support/fixture-page"
import { expect, test } from "../support/gate"

// The dev inspector: every panel tab in the showcase, its mock controls, and the fixture's edge
// cases (an overflowing rail, degraded and failed sources, a dropped-event burst). The closed rail
// over app content is in every route baseline.

const inspector = (page: Page) => page.getByRole("region", { name: "Plainworks inspector" })

async function openInspector(page: Page): Promise<void> {
  await openRoute(page, appRoute("overview"))
  await page
    .getByRole("region", { name: "Plainworks devtools" })
    .getByRole("button", { name: "Inspect" })
    .click()
  await expect(inspector(page)).toBeVisible()
}

async function openInspectorTab(page: Page, tab: string): Promise<void> {
  await openInspector(page)
  const trigger = inspector(page).getByRole("tab", { name: tab, exact: true })
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-selected", "true")
}

// The showcase has no channel source; the Next host's inspector covers the channel panel.
const INSPECTOR_TABS = ["Overview", "Timeline", "mock", "http", "query"] as const

const showcase: readonly VisualSurface[] = [
  ...INSPECTOR_TABS.map((tab) => ({
    name: `inspector-${tab.toLowerCase()}`,
    matrix: tab === "Overview" || tab === "mock" ? FULL_MATRIX : COMPACT_MATRIX,
    arrange: (page: Page) => openInspectorTab(page, tab),
  })),
  {
    name: "inspector-mock-errors-on",
    matrix: COMPACT_MATRIX,
    allowErrors: [/status of 500/],
    arrange: async (page) => {
      await openInspectorTab(page, "mock")
      const errors = inspector(page).getByRole("switch", { name: "Simulate API errors" })
      await errors.click()
      await expect(errors).toBeChecked()
      await page.keyboard.press("Escape")
      await expect(
        page.getByRole("list", { name: "Diagnostics" }).getByRole("button", {
          name: "Mock errors: on",
        }),
      ).toBeVisible()
    },
  },
  {
    name: "inspector-reset-confirm",
    matrix: DIALOG_MATRIX,
    checks: { focus: true },
    arrange: async (page) => {
      await openInspectorTab(page, "mock")
      await pressWithKeyboard(inspector(page).getByRole("button", { name: "Reset mock data" }))
      await expect(page.getByRole("alertdialog", { name: "Reset mock data?" })).toBeVisible()
    },
  },
]

async function openFixture(page: Page): Promise<void> {
  await openFixturePage(page, "inspector")
  await expect(
    page.getByRole("region", { name: "Plainworks devtools" }).getByRole("button", {
      name: "Inspect",
    }),
  ).toBeVisible()
}

const rail = (page: Page) => page.getByRole("region", { name: "Plainworks devtools" })

const fixture: readonly VisualSurface[] = [
  { name: "fixture-rail", matrix: COMPACT_MATRIX, arrange: openFixture },
  {
    name: "fixture-discovery",
    matrix: COMPACT_MATRIX,
    arrange: async (page) => {
      await openFixture(page)
      await rail(page).getByRole("button", { name: "Show 1 more diagnostic" }).click()
      await expect(inspector(page).getByRole("list", { name: "Sources" })).toBeVisible()
    },
  },
  {
    name: "fixture-degraded-source",
    matrix: COMPACT_MATRIX,
    arrange: async (page) => {
      await openFixture(page)
      await rail(page).getByRole("button", { name: "Cache health: degraded" }).click()
      await expect(inspector(page).getByText("Primary ready", { exact: true })).toBeVisible()
    },
  },
  {
    name: "fixture-failed-source",
    matrix: COMPACT_MATRIX,
    arrange: async (page) => {
      await openFixture(page)
      await page.getByRole("button", { name: "Fail primary source" }).click()
      await rail(page).getByRole("button", { name: "Primary cache: Failed" }).click()
      await inspector(page)
        .getByRole("combobox", { name: "Instance" })
        .selectOption({ label: "Primary cache" })
      await expect(inspector(page).getByRole("alert")).toContainText("Fixture source unavailable")
    },
  },
  {
    name: "fixture-burst",
    matrix: COMPACT_MATRIX,
    arrange: async (page) => {
      await openFixture(page)
      await page.getByRole("button", { name: "Emit burst" }).click()
      await rail(page)
        .getByRole("button", { name: /Timeline: .* dropped/ })
        .click()
      await expect(
        inspector(page).getByRole("list", { name: "Events" }).getByRole("listitem"),
      ).toHaveCount(500)
    },
  },
]

for (const planned of planVisualTests([...showcase, ...fixture])) {
  test(planned.title, { tag: VISUAL_TAG }, ({ page, runtimeErrors }) =>
    runVisualTest({ page, runtimeErrors }, planned),
  )
}
