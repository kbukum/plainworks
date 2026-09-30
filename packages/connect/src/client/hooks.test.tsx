// @vitest-environment jsdom Client hooks run against jsdom per file; the package default stays
//   `node` so the neutral `.` entry can never lean on a DOM global unnoticed.

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { createTestQueryClient, TestQueryClientProvider } from "@plainworks/testkit/query"
import { QueryClient } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test } from "vitest"
import { TransportProvider, useQuery } from "./hooks"

const echo = EchoService.method.echo

function EchoView(): ReactNode {
  const { data } = useQuery(echo, { message: "ping" })
  return <output>{data ? data.message : "loading"}</output>
}

function renderWithProviders(fakeTransport: ReturnType<typeof createFakeConnectTransport>) {
  const queryClient = createTestQueryClient((options) => new QueryClient(options))
  return render(
    <TransportProvider transport={fakeTransport.transport}>
      <TestQueryClientProvider client={queryClient}>
        <EchoView />
      </TestQueryClientProvider>
    </TransportProvider>,
  )
}

afterEach(cleanup)

describe("client hooks", () => {
  test("useQuery resolves against the fake transport through TransportProvider", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(echo, () => ({ message: "pong" }))

    renderWithProviders(fake)

    expect(await screen.findByText("pong")).toBeDefined()
    expect(fake.calls[0]?.input).toMatchObject({ message: "ping" })
  })

  test("has no axe-detectable accessibility violations", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(echo, () => ({ message: "pong" }))

    const { container } = renderWithProviders(fake)
    await screen.findByText("pong")

    await expectNoAxeViolations(container)
  })
})
