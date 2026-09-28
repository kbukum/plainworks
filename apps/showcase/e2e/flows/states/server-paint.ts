import { defineFlow, type FlowCheckpoint } from "@plainworks/testkit/browser"
import { appRoute } from "../../support/app"
import { PAGE_FRAME } from "../frame"

const BLOCKED_BUNDLE = {
  check: "runtime",
  match: /Failed to load resource/,
  reason: "The checkpoint blocks the client bundle on purpose to show the server paint alone",
} as const

const serverPaint = (slug: string): FlowCheckpoint => {
  const route = appRoute(slug)
  return {
    name: slug,
    act: async (page, { signal }) => {
      await page.unrouteAll({ behavior: "ignoreErrors" })
      await page.route("**/src/client/entry-client.tsx", (request) => request.abort())
      await page.goto(route.path, { waitUntil: "load", signal })
    },
    ready: (page) => page.getByRole("heading", { level: 1, name: route.heading }),
    // The client bundle never loads, so the page never hydrates.
    checks: { hydration: false },
    allow: [BLOCKED_BUNDLE],
    frame: PAGE_FRAME,
  }
}

/** The server paint alone: the client entry never loads, so each page must already be styled. */
export const serverPaintFlow = defineFlow({
  name: "server-paint",
  covers: [
    "apps/showcase/e2e/flows/states/server-paint.ts",
    "apps/showcase/src/entry-server.tsx",
    "apps/showcase/src/server/**",
    "apps/showcase/src/client/styles.css",
    "packages/{theme,elements}/src/**",
  ],
  checkpoints: ["overview", "tasks", "settings-appearance"].map(serverPaint),
})
