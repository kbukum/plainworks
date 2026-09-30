import { defineFlow } from "@plainworks/testkit/playwright"
import { HOST_ROUTES, openRoute } from "../support/host"

/**
 * Every routed page as a signed-in user first sees it, server-rendered and hydrated, with the live
 * feed paused. It also runs at the tablet breakpoint and the 320 px reflow width.
 */
export const pagesFlow = defineFlow({
  name: "pages",
  covers: [
    "apps/next-host/e2e/flows/pages.ts",
    "apps/next-host/e2e/support/host.ts",
    "apps/next-host/src/**",
  ],
  extraDevices: ["tablet", "reflow"],
  checkpoints: HOST_ROUTES.map((route) => ({
    name: route.slug,
    act: (page, { signal }) => openRoute(page, route, signal),
    ready: route.ready,
  })),
})
