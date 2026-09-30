import { defineFlow, type FlowCheckpoint } from "@plainworks/testkit/playwright"
import { APP_ROUTES, type AppRoute, openPausedTasks, openRoute } from "../support/app"
import { PAGE_FRAME } from "./frame"

const page = (route: AppRoute): FlowCheckpoint => ({
  name: route.slug,
  act: (page, { signal }) =>
    route.slug === "tasks" ? openPausedTasks(page, signal) : openRoute(page, route, signal),
  ready: route.ready,
  frame: PAGE_FRAME,
})

/**
 * Every routed page as a user first sees it, loaded from the server. It also runs at the tablet
 * breakpoint and the 320 px reflow width, where a page layout is most likely to break.
 */
export const pagesFlow = defineFlow({
  name: "pages",
  covers: [
    "apps/showcase/e2e/flows/pages.ts",
    "apps/showcase/e2e/support/app.ts",
    "apps/showcase/src/**",
    "packages/{ui,elements,theme}/src/**",
  ],
  extraDevices: ["tablet", "reflow"],
  checkpoints: APP_ROUTES.map(page),
})
