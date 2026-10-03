// @vitest-environment jsdom Client hooks run against jsdom per file; the package default stays
//   `node` so the neutral `.` entry can never lean on a DOM global unnoticed.

import { Code, ConnectError } from "@connectrpc/connect"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { createFakeConnectTransport, EchoService } from "@plainworks/testkit/connect"
import { createTestQueryClient, TestQueryClientProvider } from "@plainworks/testkit/query"
import { QueryClient } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactNode, Suspense } from "react"
import { afterEach, describe, expect, test } from "vitest"
import {
  TransportProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "./hooks"

const echo = EchoService.method.echo

function EchoView(): ReactNode {
  const { data } = useQuery(echo, { message: "ping" })
  return <output>{data ? data.message : "loading"}</output>
}

function renderWithProviders(
  fakeTransport: ReturnType<typeof createFakeConnectTransport>,
  children: ReactNode = <EchoView />,
) {
  const queryClient = createTestQueryClient(
    (options) =>
      new QueryClient({
        ...options,
        defaultOptions: {
          queries: { ...options?.defaultOptions?.queries, retry: 3, retryDelay: 0 },
          mutations: { ...options?.defaultOptions?.mutations, retry: 3 },
        },
      }),
  )
  return render(
    <TransportProvider transport={fakeTransport.transport}>
      <TestQueryClientProvider client={queryClient}>
        <Suspense fallback={<output>loading</output>}>{children}</Suspense>
      </TestQueryClientProvider>
    </TransportProvider>,
  )
}

afterEach(cleanup)

describe("client hooks", () => {
  test("query errors are typed and not retried by Query", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(echo, () => {
      throw new ConnectError("Missing", Code.NotFound)
    })
    function View() {
      const result = useQuery(echo, {})
      return <output>{result.error?.code ?? "loading"}</output>
    }
    renderWithProviders(fake, <View />)
    expect(await screen.findByText("NOT_FOUND")).toBeDefined()
    expect(fake.calls).toHaveLength(1)
  })

  test("suspense queries preserve per-call headers and selection", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(echo, () => ({ message: "pong" }))
    function View() {
      const { data } = useSuspenseQuery(
        echo,
        {},
        {
          transport: fake.transport,
          headers: { "x-locale": "en" },
          select: (value) => value.message,
        },
      )
      return <output>{data}</output>
    }
    renderWithProviders(fake, <View />)
    expect(await screen.findByText("pong")).toBeDefined()
    expect(fake.calls[0]?.header.get("x-locale")).toBe("en")
  })

  test("infinite hooks preserve paging and suspense data", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(echo, (input) => ({
      message: input.message || "first",
    }))
    function View() {
      const query = useInfiniteQuery(
        echo,
        { message: "" },
        {
          pageParamKey: "message",
          getNextPageParam: (last) => (last.message === "first" ? "second" : undefined),
        },
      )
      return (
        <>
          <output>{query.data?.pages.map((page) => page.message).join(",")}</output>
          <button
            type="button"
            onClick={() => {
              void query.fetchNextPage()
            }}
          >
            Next
          </button>
        </>
      )
    }
    function SuspenseView() {
      const { data } = useSuspenseInfiniteQuery(
        echo,
        { message: "suspense" },
        {
          transport: fake.transport,
          headers: { "x-view": "suspense" },
          pageParamKey: "message",
          getNextPageParam: () => undefined,
        },
      )
      return <output>{data.pages[0]?.message}</output>
    }
    renderWithProviders(
      fake,
      <>
        <View />
        <SuspenseView />
      </>,
    )
    await screen.findByText("first")
    await userEvent.setup().click(screen.getByRole("button", { name: "Next" }))
    await screen.findByText("first,second")
    expect(await screen.findByText("suspense")).toBeDefined()
  })

  test("mutation failures are typed and cannot inherit Query retries", async () => {
    const fake = createFakeConnectTransport(EchoService).unary(EchoService.method.mutate, () => {
      throw new ConnectError("Unavailable", Code.Unavailable)
    })
    function View() {
      const mutation = useMutation(EchoService.method.mutate, { transport: fake.transport })
      return (
        <>
          <button type="button" onClick={() => mutation.mutate({ message: "write" })}>
            Save
          </button>
          <output>{mutation.error?.code}</output>
        </>
      )
    }
    renderWithProviders(fake, <View />)
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(screen.getByText("SERVICE_UNAVAILABLE")).toBeDefined())
    expect(fake.calls).toHaveLength(1)
  })

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
