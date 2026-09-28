import { defineFlow } from "@plainworks/testkit/browser"
import { appRoute, navigateTo } from "../support/app"

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
      docs: "overview",
    },
    {
      name: "notifications",
      act: (page, { signal }) => navigateTo(page, appRoute("notifications"), signal),
      // The feed is a lazily loaded, client-fetched section: ready once its first row renders.
      ready: (page) => page.getByRole("button", { name: /^Mark read/ }).first(),
    },
  ],
})
