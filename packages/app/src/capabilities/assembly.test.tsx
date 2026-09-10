// @vitest-environment jsdom
import { createAuthStore } from "@plainworks/auth"
import { createQueryClient } from "@plainworks/query"
import { QueryProvider } from "@plainworks/query/client"
import { createSuppliedStoreContext } from "@plainworks/state/client/supplied"
import { useQueryClient } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { createContext, createElement, type ReactNode, useContext } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { defineProvider } from "../client/capability"
import { AppProvider } from "../client/provider"
import { orderCapabilities } from "../kernel/ordering"
import { createAuthCapability } from "./auth"
import { createQueryCapability } from "./query"

afterEach(cleanup)

/** Authenticate a fresh auth store — the shared setup for "state + query + auth working together". */
function authedStore() {
  const auth = createAuthStore()
  auth.setSession({
    accessToken: "in-memory-only",
    expiresAt: Date.now() + 10_000,
    identity: { subject: "ada", claims: {} },
  })
  return auth
}

describe("full recipe assembly", () => {
  it("composes query + auth in dependency order and reads both below", () => {
    const client = createQueryClient()
    const auth = authedStore()
    const { capability: authCapability, useSession } = createAuthCapability({
      store: auth.store,
      dependsOn: ["query"], // auth mounts inside the shared cache, deterministically
    })
    // Registered auth-first; the topological sort still mounts query outermost.
    function Screen(): ReactNode {
      const sameClient = useQueryClient() === client
      const session = useSession()
      return createElement(
        "p",
        null,
        `${sameClient ? "cache" : "no-cache"}:${session.identity?.subject ?? "anon"}`,
      )
    }
    render(
      <AppProvider capabilities={[authCapability, createQueryCapability({ client })]}>
        <Screen />
      </AppProvider>,
    )
    expect(screen.getByText("cache:ada")).toBeDefined()
  })
})

describe("freedom to opt out (no `app`)", () => {
  it("reaches equivalent behavior by hand-wiring the same published bindings", () => {
    // The ejectability proof: delete `app`, compose `query` + `auth`'s published bindings directly,
    // and lose only convenience — the same client + session are readable below.
    const client = createQueryClient()
    const auth = authedStore()
    const session = createSuppliedStoreContext<ReturnType<typeof auth.getSnapshot>>()

    function Screen(): ReactNode {
      const sameClient = useQueryClient() === client
      const current = session.useStore()
      return createElement(
        "p",
        null,
        `${sameClient ? "cache" : "no-cache"}:${current.identity?.subject ?? "anon"}`,
      )
    }
    render(
      <QueryProvider client={client}>
        <session.Provider store={auth.store}>
          <Screen />
        </session.Provider>
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
