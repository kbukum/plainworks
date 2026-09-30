// @vitest-environment jsdom
import { createSessionContext } from "@plainworks/auth/client"
import { ANONYMOUS_AUTH, type AuthSnapshot } from "@plainworks/auth/session"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../../client/provider"
import { createApp } from "../../kernel/app"
import { createAuthCapability } from "./provider"
import { AUTH_CAPABILITY_ID, createAuthResolver } from "./resolver"

afterEach(cleanup)

const ada: AuthSnapshot = { authenticated: true, subject: "ada", name: "Ada" }

describe("createAuthResolver", () => {
  it("reads the session from the request cookie header", async () => {
    const seen: string[] = []
    const app = createApp({
      capabilities: [
        createAuthResolver({
          read: async (cookieHeader) => {
            seen.push(cookieHeader)
            return ada
          },
        }),
      ],
    })
    const snapshot = await app.resolve({ headers: new Headers({ cookie: "session=abc" }) })
    expect(seen).toEqual(["session=abc"])
    expect(snapshot.capabilities[AUTH_CAPABILITY_ID]).toEqual(ada)
  })

  it("passes an empty header when the request has no cookies", async () => {
    const app = createApp({
      capabilities: [
        createAuthResolver({ id: "who", read: async (header) => (header ? ada : ANONYMOUS_AUTH) }),
      ],
    })
    const snapshot = await app.resolve({ headers: new Headers() })
    expect(snapshot.capabilities.who).toEqual(ANONYMOUS_AUTH)
  })
})

describe("createAuthCapability", () => {
  function Who({ session }: { session: ReturnType<typeof createSessionContext> }): ReactNode {
    const identity = session.useIdentity()
    return <p>{identity?.subject ?? "anonymous"}</p>
  }

  it("seeds the session from the server slice on the first render", () => {
    const session = createSessionContext()
    const html = renderToString(
      <AppProvider
        capabilities={[createAuthCapability({ session })]}
        snapshot={{ capabilities: { [AUTH_CAPABILITY_ID]: ada } }}
      >
        <Who session={session} />
      </AppProvider>,
    )
    expect(html).toContain("ada")
  })

  it("treats a malformed or absent slice as signed out", async () => {
    const session = createSessionContext()
    const { container } = render(
      <AppProvider
        capabilities={[createAuthCapability({ session, id: "who", dependsOn: [] })]}
        snapshot={{ capabilities: { who: { authenticated: "yes" } } }}
      >
        <Who session={session} />
      </AppProvider>,
    )
    expect(screen.getByText("anonymous")).toBeDefined()
    await expectNoAxeViolations(container)
  })
})
