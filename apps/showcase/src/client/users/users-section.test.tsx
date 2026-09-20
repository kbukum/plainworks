// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, prefetchQuery } from "@plainworks/query"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { USER_LIST_PARAMS } from "../../app/constants"
import { userListPlan } from "../../app/user-read"
import { HttpClientProvider } from "../http-client"
import { UsersSection } from "./users-section"

// The Users directory proven from the user's vantage: real `@plainworks/ui` composites over an
// `@plainworks/http` client against the `@plainworks/demo` MSW backend, with a hydrated
// `@plainworks/query` read. Assertions query by role/label and drive with `user-event`; no real
// network or timer.

const handle = createMockServerHandle({ seed: 7 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => installMatchMedia())
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

async function renderUsers(options: { prefetch?: boolean } = {}) {
  const { prefetch = true } = options
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  if (prefetch) {
    await prefetchQuery(queryClient, userListPlan(httpClient, USER_LIST_PARAMS))
  }
  const ui = render(
    <QueryClientProvider client={queryClient}>
      <HttpClientProvider client={httpClient}>
        <UsersSection />
      </HttpClientProvider>
    </QueryClientProvider>,
  )
  return { httpClient, queryClient, ...ui }
}

describe("users section", () => {
  it("renders the server-prefetched directory", async () => {
    await renderUsers()
    const table = await screen.findByRole("table", { name: /Users/ })
    await waitFor(() => expect(table.querySelectorAll("tbody tr").length).toBe(10))
  })

  it("exposes role, status, and department facet groups", async () => {
    await renderUsers()
    await screen.findByRole("table", { name: /Users/ })
    expect(screen.getByRole("group", { name: "Role" })).toBeDefined()
    expect(screen.getByRole("group", { name: "Status" })).toBeDefined()
    expect(screen.getByRole("group", { name: "Department" })).toBeDefined()
  })

  it("filters the directory by an active status facet", async () => {
    const user = userEvent.setup()
    await renderUsers()
    const table = await screen.findByRole("table", { name: /Users/ })
    const before = table.querySelectorAll("tbody tr").length

    await user.click(screen.getByRole("checkbox", { name: /Active/ }))

    await waitFor(() => {
      const rows = screen.getAllByRole("row").slice(1)
      const dataRows = rows.filter((row) => within(row).queryAllByRole("cell").length > 0)
      expect(dataRows.length).toBeLessThanOrEqual(before)
      for (const row of dataRows) {
        expect(within(row).getByText("Active")).toBeDefined()
      }
    })
  })

  it("opens a read-only profile overlay for a member", async () => {
    const user = userEvent.setup()
    await renderUsers()
    await screen.findByRole("table", { name: /Users/ })

    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Member since")).toBeDefined()
    expect(within(dialog).getByText("Last active")).toBeDefined()
    expect(within(dialog).queryByRole("combobox")).toBeNull()
  })

  it("renders an error callout when the directory query fails", async () => {
    handle.server.use(http.get("*/api/users", () => new HttpResponse(null, { status: 500 })))
    await renderUsers({ prefetch: false })
    expect(await screen.findByText("Users are unavailable")).toBeDefined()
  })

  it("carries no axe violations with the profile overlay open", async () => {
    const user = userEvent.setup()
    const { container } = await renderUsers()
    await screen.findByRole("table", { name: /Users/ })
    await user.click(screen.getAllByRole("button", { name: /^View/ })[0] as HTMLElement)
    await screen.findByRole("dialog")
    await expectNoAxeViolations(container)
  })
})
