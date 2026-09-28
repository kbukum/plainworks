import { defineFlow } from "@plainworks/testkit/browser"
import type { Page } from "@playwright/test"

/**
 * Follow a primary navigation link: the rail when it is visible, the sections drawer otherwise,
 * as a narrow screen shows it.
 */
async function navigate(page: Page, name: string, signal: AbortSignal): Promise<void> {
  const rail = page.getByRole("navigation", { name: "Primary" })
  if (await rail.isVisible()) {
    await rail.getByRole("link", { name, exact: true }).click({ signal })
    return
  }
  await page.getByRole("button", { name: "Open sections menu" }).click({ signal })
  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name, exact: true })
    .click({ signal })
}

/** Land on the overview, then reach the notifications feed through the app's own navigation. */
export const navigationFlow = defineFlow({
  name: "navigation",
  covers: [
    "apps/showcase/e2e/flows/navigation.ts",
    "apps/showcase/src/client/{shell,overview,notifications}/**",
    "apps/showcase/src/app/navigation/**",
    "apps/showcase/src/app/{overview,notification}-*.ts",
    "packages/ui/src/client/{shell,navigation,layout,page,display}/**",
  ],
  checkpoints: [
    {
      name: "overview",
      act: (page, { signal }) => page.goto("/", { signal }),
      ready: (page) => page.getByText("Revenue trend", { exact: true }),
    },
    {
      name: "notifications",
      act: (page, { signal }) => navigate(page, "Notifications", signal),
      // The feed is a lazily loaded, client-fetched section: ready once its first row renders.
      ready: (page) => page.getByRole("button", { name: /^Mark read/ }).first(),
    },
  ],
})
