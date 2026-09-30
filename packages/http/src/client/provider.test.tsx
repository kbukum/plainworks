// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { createHttpClient, type HttpClient } from "../index"
import { HttpClientProvider, useHttpClient } from "./provider"

afterEach(cleanup)

function ClientProbe({ expected }: { readonly expected: HttpClient }): ReactNode {
  const client = useHttpClient()
  return <p>{client === expected ? "same client" : "other client"}</p>
}

describe("HttpClientProvider", () => {
  it("hands the injected client to every hook below it", async () => {
    const client = createHttpClient({ baseUrl: "https://api.test" })
    const { container } = render(
      <HttpClientProvider client={client}>
        <ClientProbe expected={client} />
      </HttpClientProvider>,
    )
    expect(screen.getByText("same client")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("lets a nested provider override the client for its subtree", () => {
    const outer = createHttpClient({ baseUrl: "https://outer.test" })
    const inner = createHttpClient({ baseUrl: "https://inner.test" })
    render(
      <HttpClientProvider client={outer}>
        <HttpClientProvider client={inner}>
          <ClientProbe expected={inner} />
        </HttpClientProvider>
      </HttpClientProvider>,
    )
    expect(screen.getByText("same client")).toBeDefined()
  })
})

describe("useHttpClient", () => {
  it("throws a clear error outside a provider", () => {
    const client = createHttpClient({ baseUrl: "https://api.test" })
    expect(() => render(<ClientProbe expected={client} />)).toThrow(
      "useHttpClient must be used inside <HttpClientProvider>",
    )
  })
})
