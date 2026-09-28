import { defineFlow, type FlowCheckpoint } from "@plainworks/testkit/browser"
import { appRoute, openRoute } from "../../support/app"

const SEARCHES = [
  ["orders", "Search orders"],
  ["products", "Search products"],
  ["users", "Search users"],
] as const

const empty = ([slug, search]: (typeof SEARCHES)[number]): FlowCheckpoint => ({
  name: slug,
  act: async (page, { signal }) => {
    await openRoute(page, appRoute(slug), signal)
    await page.getByRole("searchbox", { name: search }).fill("zzzz-no-match", { signal })
  },
  ready: (page) => page.getByText(/^No .* match/),
})

/** Every catalog when a search matches nothing. */
export const emptyFlow = defineFlow({
  name: "empty",
  covers: [
    "apps/showcase/e2e/flows/states/empty.ts",
    "apps/showcase/src/client/{catalog,orders,products,users}/**",
    "packages/ui/src/client/{data-table,list,feedback}/**",
  ],
  checkpoints: SEARCHES.map(empty),
})
