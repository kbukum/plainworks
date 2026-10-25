import {
  createApiRequestMockControlTransport,
  createMockControlClient,
} from "@plainworks/mocks/control"
import { MOCK_SCOPE_HEADER } from "@plainworks/mocks/scope"
import { createBrowserGate } from "@plainworks/testkit/playwright"
import { type APIRequestContext, expect } from "@playwright/test"
import { signIn } from "./session"

const control = (request: APIRequestContext) =>
  createMockControlClient({
    client: createApiRequestMockControlTransport(request, { basePath: "/api" }),
  })

/**
 * The `test` every Next host spec uses. Every worker shares the run's one `next dev`
 * (`e2e/support/gate-host.ts`), and each test reads and writes only its own data scope. Each test
 * starts from the seeded task fixtures with mock errors and latency off, reads a fixed "now",
 * signs in after reset, and fails on any runtime error, hydration error, or off-origin request.
 */
export const test = createBrowserGate({
  signIn,
  dataScope: {
    header: MOCK_SCOPE_HEADER,
    release: (request) => control(request).releaseScope(),
  },
  resetHost: (request) => control(request).restore(),
})

export { expect }
