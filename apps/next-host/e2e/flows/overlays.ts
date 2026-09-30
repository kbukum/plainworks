import {
  defineFlow,
  type FlowCheckpoint,
  focusWithKeyboard,
  pressWithKeyboard,
} from "@plainworks/testkit/playwright"
import { hostRoute, openRoute } from "../support/host"

// The Next host registers the HTTP and channel sources, so its inspector covers the channel panel
// the showcase lacks.
const INSPECTOR_TABS = ["Overview", "Timeline", "http", "channel"] as const

const inspectorTab = (tab: (typeof INSPECTOR_TABS)[number]): FlowCheckpoint => ({
  name: `inspector-${tab.toLowerCase()}`,
  act: async (page, { signal }) => {
    await openRoute(page, hostRoute("tasks"), signal)
    await page
      .getByRole("region", { name: "Plainworks devtools" })
      .getByRole("button", { name: "Inspect" })
      .click({ signal })
    await page
      .getByRole("region", { name: "Plainworks inspector" })
      .getByRole("tab", { name: tab, exact: true })
      .click({ signal })
  },
  ready: (page) =>
    page
      .getByRole("region", { name: "Plainworks inspector" })
      .getByRole("tab", { name: tab, exact: true, selected: true }),
})

/**
 * The header menus, the sections drawer, and every development inspector tab, open over their page.
 * Menus open from the keyboard, the way the focus check's user reaches them, and each checkpoint
 * reloads its page, so no overlay leaks into the next. The sections drawer opens only on a narrow
 * screen; a wide screen shows the navigation in place, and the focus check lands on its first link.
 */
export const overlaysFlow = defineFlow({
  name: "overlays",
  covers: [
    "apps/next-host/e2e/flows/overlays.ts",
    "apps/next-host/src/client/**",
    "packages/{ui,devtools}/src/**",
  ],
  checkpoints: [
    {
      name: "account-menu",
      act: async (page, { signal }) => {
        await openRoute(page, hostRoute("overview"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /Signed in as/ }))
      },
      ready: (page) => page.getByRole("menuitem", { name: "Log out" }),
      checks: { focus: true },
    },
    {
      name: "color-mode-menu",
      act: async (page, { signal }) => {
        await openRoute(page, hostRoute("overview"), signal)
        await pressWithKeyboard(page.getByRole("button", { name: /color mode/i }))
      },
      ready: (page) => page.getByRole("menuitemradio", { name: "Dark" }),
      checks: { focus: true },
    },
    {
      name: "sections",
      act: async (page, { signal }) => {
        await openRoute(page, hostRoute("tasks"), signal)
        const open = page.getByRole("button", { name: "Open sections menu" })
        if (await open.isVisible()) await pressWithKeyboard(open)
        else
          await focusWithKeyboard(
            page.getByRole("navigation", { name: "Primary" }).getByRole("link").first(),
          )
      },
      ready: (page) =>
        page
          .getByRole("dialog", { name: "Sections" })
          .or(page.getByRole("navigation", { name: "Primary" }))
          .first(),
      checks: { focus: true },
    },
    ...INSPECTOR_TABS.map(inspectorTab),
  ],
})
