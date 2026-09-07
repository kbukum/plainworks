// @vitest-environment jsdom
// Client hooks run against jsdom per file; the package default stays `node` so the neutral `.` entry
// can never lean on a DOM global unnoticed.
import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import axe from "axe-core"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test } from "vitest"
import { TransportProvider, useQuery } from "./hooks"

const echo = EchoService.method.echo

function EchoView(): ReactNode {
  const { data } = useQuery(echo, { message: "ping" })
  return <output>{data ? data.message : "loading"}</output>
}

function renderWithProviders(fakeTransport: ReturnType<typeof createFakeConnectTransport>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <TransportProvider transport={fakeTransport.transport}>
      <QueryClientProvider client={queryClient}>
        <EchoView />
      </QueryClientProvider>
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

    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
