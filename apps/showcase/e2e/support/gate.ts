import { createBrowserGate } from "@plainworks/testkit/browser"
import { expect } from "@playwright/test"
import { SHOWCASE_HOST } from "./host"
import { signIn } from "./session"

/**
 * The `test` every showcase spec uses. Each worker runs its own dev SSR host and signs in once.
 * Each test starts from the seeded demo data with mock errors and latency off, reads a fixed
 * "now", and fails on any runtime error or off-origin request.
 */
export const test = createBrowserGate({
  host: SHOWCASE_HOST,
  signIn,
  resetHost: async (request) => {
    for (const [path, data] of [
      ["/mock/reset", undefined],
      ["/mock/error", { enabled: false }],
      ["/mock/latency", { latency: 0 }],
    ] as const) {
      const response = await request.post(path, data === undefined ? {} : { data })
      expect(response.ok(), `${path} answered ${response.status()}`).toBe(true)
    }
  },
})

export { expect }
