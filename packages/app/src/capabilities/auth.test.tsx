// @vitest-environment jsdom
import { createAuthStore } from "@plainworks/auth"
import { act, cleanup, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../client/provider"
import { createAuthCapability } from "./auth"

afterEach(cleanup)

describe("createAuthCapability", () => {
  it("publishes the authenticated session to the subtree through auth's own store", () => {
    const auth = createAuthStore()
    auth.setSession({
      accessToken: "in-memory-only",
      expiresAt: Date.now() + 10_000,
      identity: { subject: "ada", claims: {} },
    })
    const { capability, useSession } = createAuthCapability({ store: auth.store })

    function Greeting(): ReactNode {
      const session = useSession()
      return createElement(
        "p",
        null,
        session.status === "authenticated" ? `Welcome, ${session.identity?.subject}` : "Sign in",
      )
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Greeting />
      </AppProvider>,
    )
    // Synchronous read (getByText, not findByText): the snapshot is present on the first paint.
    expect(screen.getByText("Welcome, ada")).toBeDefined()
  })

  it("reads a reference-stable slice via a selector, never the token", () => {
    const auth = createAuthStore()
    auth.setSession({
      accessToken: "secret",
      expiresAt: Date.now() + 10_000,
      identity: { subject: "grace", claims: { role: "admin" } },
    })
    const { capability, useSession } = createAuthCapability({ store: auth.store })

    function Status(): ReactNode {
      const status = useSession((session) => session.status)
      return createElement("p", null, status)
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Status />
      </AppProvider>,
    )
    expect(screen.getByText("authenticated")).toBeDefined()
  })

  it("defaults to the unauthenticated snapshot before any login", () => {
    const auth = createAuthStore()
    const { capability, useSession } = createAuthCapability({ store: auth.store })

    function Greeting(): ReactNode {
      const session = useSession()
      return createElement("p", null, session.status)
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Greeting />
      </AppProvider>,
    )
    expect(screen.getByText("unauthenticated")).toBeDefined()
  })

  it("declares an explicit dependency so it mounts inside what it needs", () => {
    const auth = createAuthStore()
    const { capability } = createAuthCapability({ store: auth.store, dependsOn: ["query"] })
    expect(capability.id).toBe("auth")
    expect(capability.dependsOn).toEqual(["query"])
  })

  it("re-renders the subtree when the session changes (login after mount)", () => {
    const auth = createAuthStore()
    const { capability, useSession } = createAuthCapability({ store: auth.store })

    function Greeting(): ReactNode {
      const session = useSession()
      return createElement(
        "p",
        null,
        session.status === "authenticated" ? `Welcome, ${session.identity?.subject}` : "Sign in",
      )
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Greeting />
      </AppProvider>,
    )
    expect(screen.getByText("Sign in")).toBeDefined()
    // A later login on the underlying auth store flows through to the subtree — live glue.
    act(() => {
      auth.setSession({
        accessToken: "in-memory-only",
        expiresAt: Date.now() + 10_000,
        identity: { subject: "ada", claims: {} },
      })
    })
    expect(screen.getByText("Welcome, ada")).toBeDefined()
  })

  it("is a client session, not an SSR resolver — server markup shows the pre-login default", () => {
    // Documents the recipe's scope boundary (see its TSDoc): auth's snapshot store always
    // initializes unauthenticated, so a real server render emits the default even for an authed
    // store. Server-resolved no-auth-flash needs auth's server session binding, not this recipe.
    const auth = createAuthStore()
    auth.setSession({
      accessToken: "in-memory-only",
      expiresAt: Date.now() + 10_000,
      identity: { subject: "ada", claims: {} },
    })
    const { capability, useSession } = createAuthCapability({ store: auth.store })

    function Greeting(): ReactNode {
      return createElement("p", null, useSession().status)
    }
    const html = renderToStaticMarkup(
      createElement(AppProvider, { capabilities: [capability], children: createElement(Greeting) }),
    )
    expect(html).toBe("<p>unauthenticated</p>")
  })
})
