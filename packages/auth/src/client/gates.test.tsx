// @vitest-environment jsdom
import type { Authorizer, Decision, Identity } from "@plainworks/std"
import { type Deferred, deferred } from "@plainworks/testkit"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { type ReactNode, useState } from "react"
import { afterEach, describe, expect, test } from "vitest"
import { createAuthGates } from "./gates"
import { createSessionContext } from "./session-context"

afterEach(cleanup)

const admin: Identity = { subject: "u1", claims: { role: "admin" } }

const allowAll: Authorizer = () => ({ allow: true })
const denyAll: Authorizer = () => ({ allow: false, reason: "forbidden" })
const allowAdmin: Authorizer = (request) =>
  request.identity?.claims.role === "admin"
    ? { allow: true }
    : { allow: false, reason: "forbidden" }

describe("RequireAuth", () => {
  test("renders its children for an authenticated caller", () => {
    const context = createSessionContext()
    const { RequireAuth } = createAuthGates(context)
    render(
      <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
        <RequireAuth fallback={<p>Please sign in</p>}>
          <p>Secret</p>
        </RequireAuth>
      </context.SessionProvider>,
    )
    expect(screen.getByText("Secret")).toBeDefined()
    expect(screen.queryByText("Please sign in")).toBeNull()
  })

  test("renders the fallback for an unauthenticated caller", () => {
    const context = createSessionContext()
    const { RequireAuth } = createAuthGates(context)
    render(
      <context.SessionProvider>
        <RequireAuth fallback={<p>Please sign in</p>}>
          <p>Secret</p>
        </RequireAuth>
      </context.SessionProvider>,
    )
    expect(screen.getByText("Please sign in")).toBeDefined()
    expect(screen.queryByText("Secret")).toBeNull()
  })
})

describe("Can", () => {
  test("renders its children when the authorizer allows the action", async () => {
    const context = createSessionContext()
    const { Can } = createAuthGates(context)
    render(
      <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
        <Can authorizer={allowAdmin} action="post:delete" fallback={<p>Not allowed</p>}>
          <button type="button">Delete post</button>
        </Can>
      </context.SessionProvider>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete post" })).toBeDefined())
    expect(screen.queryByText("Not allowed")).toBeNull()
  })

  test("renders the fallback when the authorizer denies the action", async () => {
    const context = createSessionContext()
    const { Can } = createAuthGates(context)
    render(
      <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
        <Can authorizer={denyAll} action="post:delete" fallback={<p>Not allowed</p>}>
          <button type="button">Delete post</button>
        </Can>
      </context.SessionProvider>,
    )
    await waitFor(() => expect(screen.getByText("Not allowed")).toBeDefined())
    expect(screen.queryByRole("button", { name: "Delete post" })).toBeNull()
  })

  test("stays default-deny (fallback) until an async decision resolves", async () => {
    const context = createSessionContext()
    const { Can } = createAuthGates(context)
    const gate = deferred<Decision>()
    const pendingAllow: Authorizer = () => gate.promise
    render(
      <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
        <Can authorizer={pendingAllow} action="post:delete" fallback={<p>Checking…</p>}>
          <button type="button">Delete post</button>
        </Can>
      </context.SessionProvider>,
    )
    // While the decision is in flight the gate withholds access.
    expect(screen.getByText("Checking…")).toBeDefined()
    gate.resolve({ allow: true })
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete post" })).toBeDefined())
  })

  test("fails closed (fallback) when the authorizer throws", async () => {
    const context = createSessionContext()
    const { Can } = createAuthGates(context)
    const boom: Authorizer = () => {
      throw new Error("policy boom")
    }
    render(
      <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
        <Can authorizer={boom} action="post:delete" fallback={<p>Not allowed</p>}>
          <button type="button">Delete post</button>
        </Can>
      </context.SessionProvider>,
    )
    await waitFor(() => expect(screen.getByText("Not allowed")).toBeDefined())
    expect(screen.queryByRole("button", { name: "Delete post" })).toBeNull()
  })

  test("reverts to the fallback synchronously when the gated inputs change", async () => {
    const context = createSessionContext()
    const { Can } = createAuthGates(context)
    // One deferred decision per invocation: resolve the first (`post:read`) to allow, then leave
    // the second (`post:delete`) pending so any content shown for the new action would be a stale
    // allow flash rather than a settled decision.
    const gates: Deferred<Decision>[] = []
    const slow: Authorizer = () => {
      const gate = deferred<Decision>()
      gates.push(gate)
      return gate.promise
    }
    function Harness(): ReactNode {
      const [action, setAction] = useState("post:read")
      return (
        <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
          <button type="button" onClick={() => setAction("post:delete")}>
            Downgrade
          </button>
          <Can authorizer={slow} action={action} fallback={<p>Not allowed</p>}>
            <span>Allowed content</span>
          </Can>
        </context.SessionProvider>
      )
    }
    render(<Harness />)
    await waitFor(() => expect(gates.length).toBeGreaterThan(0))
    gates[0]?.resolve({ allow: true })
    await waitFor(() => expect(screen.getByText("Allowed content")).toBeDefined())
    await userEvent.click(screen.getByRole("button", { name: "Downgrade" }))
    // The second decision stays pending; the prior allow must not carry to the new action.
    expect(screen.queryByText("Allowed content")).toBeNull()
    expect(screen.getByText("Not allowed")).toBeDefined()
  })

  test("the gated content and fallback carry no axe violations", async () => {
    const context = createSessionContext()
    const { RequireAuth, Can } = createAuthGates(context)
    const { container } = render(
      <main>
        <context.SessionProvider initialSnapshot={{ status: "authenticated", identity: admin }}>
          <RequireAuth fallback={<p>Please sign in</p>}>
            <Can authorizer={allowAll} action="post:read" fallback={<p>Not allowed</p>}>
              <button type="button">Delete post</button>
            </Can>
          </RequireAuth>
        </context.SessionProvider>
      </main>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete post" })).toBeDefined())
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
