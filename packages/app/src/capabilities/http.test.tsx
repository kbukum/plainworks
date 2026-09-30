// @vitest-environment jsdom
import { createHttpClient, type HttpClient } from "@plainworks/http"
import { useHttpClient } from "@plainworks/http/client"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../client/provider"
import { createHttpCapability } from "./http"

afterEach(cleanup)

function ReadsClient({ expected }: { readonly expected: HttpClient }): ReactNode {
  return <p>{useHttpClient() === expected ? "same-client" : "other"}</p>
}

describe("createHttpCapability", () => {
  it("provides the caller-owned client to the subtree", async () => {
    const client = createHttpClient({ baseUrl: "https://api.test" })
    const { container } = render(
      <AppProvider capabilities={[createHttpCapability({ client })]}>
        <ReadsClient expected={client} />
      </AppProvider>,
    )
    expect(screen.getByText("same-client")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("declares its id and dependencies", () => {
    const client = createHttpClient({ baseUrl: "https://api.test" })
    const capability = createHttpCapability({ client, id: "api", dependsOn: ["auth"] })
    expect(capability.id).toBe("api")
    expect(capability.dependsOn).toEqual(["auth"])
  })
})
