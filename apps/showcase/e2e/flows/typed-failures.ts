import { connectFailureJson, createRpcFailureCases } from "@plainworks/connect/testing"
import { wireFailures } from "@plainworks/mocks/failure"
import { defineFlow } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"
import { PAGE_FRAME } from "./frame"

const invalid = createRpcFailureCases().find((fixture) => fixture.name === "descriptor-paths")
const transient = wireFailures.find(
  ({ wire }) => wire.name === "service_unavailable_retry_no_delay",
)
const unauthenticated = wireFailures.find(({ wire }) => wire.name === "unauthorized")
if (invalid === undefined || transient === undefined || unauthenticated === undefined) {
  throw new Error("Missing failure fixtures")
}
const invalidJson = connectFailureJson(invalid.error)
const transientJson = transient.wire.connectJson
const unauthenticatedJson = unauthenticated.wire.connectJson

export const typedFailuresFlow = defineFlow({
  name: "typed-failures",
  covers: [
    "packages/{std,connect,http,app,ui,mocks}/src/**",
    "apps/showcase/e2e/fixtures/failures*",
  ],
  checkpoints: [
    {
      name: "server-fields-retry-and-terminal-auth",
      act: async (page) => {
        let reads = 0
        let authReads = 0
        await page.route("**/plainworks.testkit.v1.ProfileService/*", async (route) => {
          const request = route.request()
          if (request.url().endsWith("/SaveProfile")) {
            await route.fulfill({ status: 400, json: invalidJson })
          } else if (request.postDataJSON().label === "auth") {
            authReads++
            await route.fulfill({ status: 401, json: unauthenticatedJson })
          } else {
            reads++
            await route.fulfill(
              reads === 1
                ? { status: 503, json: transientJson }
                : { status: 200, json: { label: "Read recovered" } },
            )
          }
        })
        await page.goto("/e2e/fixtures/failures.html")
        await page.getByRole("button", { name: "Save profile" }).click()
        await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true")
        await expect(page.getByText("This name is already taken")).toBeVisible()
        await expect(page.getByLabel("Postal code")).toHaveAttribute("aria-invalid", "true")
        await expect(page.getByText("Review your profile before saving")).toBeVisible()
        await page.getByRole("button", { name: "Retryable read" }).click()
        await expect(page.getByRole("status")).toHaveText("Read recovered")
        expect(reads).toBe(2)
        await page.getByRole("button", { name: "Expired session" }).click()
        await expect(page.getByRole("status")).toHaveText("Sign in to continue")
        expect(authReads).toBe(1)
      },
      ready: (page) => page.getByText("Sign in to continue"),
      frame: PAGE_FRAME,
      allow: [
        {
          check: "runtime",
          match: /status of (400|401|503)/,
          reason:
            "The failure journey deliberately returns validation, transient and auth failures",
        },
      ],
    },
  ],
})
