import {
  createApiRequestMockControlTransport,
  createMockControlClient,
} from "@plainworks/mocks/control"
import { createBrowserGate } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { NEXT_HOST_SERVER } from "./server"
import { signIn } from "./session"

/**
 * The `test` every Next host spec uses. Each worker runs its own `next dev`. Each
 * test starts from the seeded task fixtures with mock errors and latency off, reads a fixed "now",
 * signs in after reset, and fails on any runtime error, hydration error, or off-origin request.
 */
export const test = createBrowserGate({
  host: NEXT_HOST_SERVER,
  signIn,
  resetHost: async (request) => {
    const control = createMockControlClient({
      client: createApiRequestMockControlTransport(request, { basePath: "/api" }),
    })
    await control.restore()
  },
})

export { expect }
