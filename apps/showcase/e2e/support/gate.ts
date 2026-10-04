import {
  createApiRequestMockControlTransport,
  createMockControlClient,
} from "@plainworks/mocks/control"
import { createBrowserGate } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { SHOWCASE_HOST } from "./host"
import { signIn } from "./session"

/**
 * The `test` every showcase spec uses. Each worker runs its own dev SSR host.
 * Each test starts from the seeded demo data with mock errors and latency off, reads a fixed
 * "now", signs in after reset, and fails on any runtime error or off-origin request.
 */
export const test = createBrowserGate({
  host: SHOWCASE_HOST,
  signIn,
  resetHost: async (request) => {
    const control = createMockControlClient({
      client: createApiRequestMockControlTransport(request),
    })
    await control.restore()
  },
})

export { expect }
