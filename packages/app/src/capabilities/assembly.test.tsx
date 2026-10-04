// @vitest-environment jsdom
import { createSessionContext } from "@plainworks/auth/client"
import { type AuthSnapshot, createAuthStore, sessionSnapshotOf } from "@plainworks/auth/session"
import { createQueryClient } from "@plainworks/query"
import { QueryProvider } from "@plainworks/query/client"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { useQueryClient } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { createContext, createElement, type ReactNode, useContext } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineProvider } from "../client/capability"
import { AppProvider } from "../client/provider"
import { orderCapabilities } from "../kernel/ordering"
import { AUTH_CAPABILITY_ID, createAuthCapability } from "./auth"
import { createQueryCapability } from "./query"

afterEach(cleanup)

const ada: AuthSnapshot = { authenticated: true, subject: "ada", name: null }

describe("full recipe assembly", () => {
  it("composes query + auth in dependency order and reads both below", async () => {
    const client = createQueryClient()
    const session = createSessionContext()
    function Screen(): ReactNode {
      const sameClient = useQueryClient() === client
      const identity = session.useIdentity()
      return createElement(
        "p",
        null,
        `${sameClient ? "cache" : "no-cache"}:${identity?.subject ?? "anon"}`,
      )
    }
    // Registered auth-first; the topological sort still mounts query outermost.
    const { container } = render(
      <AppProvider
        capabilities={[
          createAuthCapability({
            session,
            runtime: createAuthStore({ fetch: vi.fn(), initialSnapshot: sessionSnapshotOf(ada) }),
            dependsOn: ["query"],
          }),
          createQueryCapability({ client }),
        ]}
        snapshot={{ capabilities: { [AUTH_CAPABILITY_ID]: ada } }}
      >
        <Screen />
      </AppProvider>,
    )
    expect(screen.getByText("cache:ada")).toBeDefined()
    await expectNoAxeViolations(container)
  })
})

describe("freedom to opt out (no `app`)", () => {
  it("reaches equivalent behavior by hand-wiring the same published bindings", () => {
    // The ejectability proof: delete `app`, compose `query` + `auth`'s published bindings directly,
    // and lose only convenience — the same client + session are readable below.
    const client = createQueryClient()
    const session = createSessionContext()

    function Screen(): ReactNode {
      const sameClient = useQueryClient() === client
      const identity = session.useIdentity()
      return createElement(
        "p",
        null,
        `${sameClient ? "cache" : "no-cache"}:${identity?.subject ?? "anon"}`,
      )
    }
    render(
      <QueryProvider client={client}>
        <session.SessionProvider
          runtime={createAuthStore({ fetch: vi.fn(), initialSnapshot: sessionSnapshotOf(ada) })}
        >
          <Screen />
        </session.SessionProvider>
      </QueryProvider>,
    )
    expect(screen.getByText("cache:ada")).toBeDefined()
  })
})

describe("foreign providers welcome", () => {
  it("drops an arbitrary third-party provider into the registry as a capability", () => {
    const ThirdPartyContext = createContext("default")

    function ReadsForeign(): ReactNode {
      return createElement("p", null, useContext(ThirdPartyContext))
    }
    render(
      <AppProvider
        capabilities={[
          defineProvider({
            id: "third-party",
            provider: ({ children }) =>
              createElement(ThirdPartyContext.Provider, { value: "wired" }, children),
          }),
        ]}
      >
        <ReadsForeign />
      </AppProvider>,
    )
    expect(screen.getByText("wired")).toBeDefined()
  })
})

describe("mixed assembly (recipe + hand-authored)", () => {
  it("orders a recipe and a hand-authored capability by declared dependency, not authoring order", () => {
    const client = createQueryClient()
    // A hand-authored capability that depends on the query recipe — it must mount inside it.
    const marker = defineProvider({
      id: "feature",
      dependsOn: ["query"],
      provider: ({ children }) => createElement("div", { "data-cap": "feature" }, children),
    })
    const capabilities = [marker, createQueryCapability({ client })]
    // Declared dependency, not authoring order, decides composition: query is sorted outermost.
    expect(orderCapabilities(capabilities).map((capability) => capability.id)).toEqual([
      "query",
      "feature",
    ])
    const { container } = render(
      <AppProvider capabilities={capabilities}>
        <span>leaf</span>
      </AppProvider>,
    )
    // And the dependent still mounts (its provider renders below the query provider in the tree).
    expect(container.querySelector('[data-cap="feature"]')).not.toBeNull()
  })
})
