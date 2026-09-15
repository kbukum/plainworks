// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the neutral `.` and
// `./server` entries can never lean on a DOM global unnoticed.
import type { Identity } from "@plainworks/std"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, test } from "vitest"
import { createSessionContext } from "./session-context"

afterEach(cleanup)

const identity: Identity = { subject: "user-123", claims: { name: "Ada" } }

describe("createSessionContext", () => {
  test("hydrates the server-resolved snapshot for the first render", () => {
    const { SessionProvider, useSession, useIdentity, useIsAuthenticated } = createSessionContext()
    function View(): ReactNode {
      const session = useSession()
      return (
        <output>
          {session.status}|{useIdentity()?.subject ?? "none"}|{String(useIsAuthenticated())}
        </output>
      )
    }
    render(
      <SessionProvider initialSnapshot={{ status: "authenticated", identity }}>
        <View />
      </SessionProvider>,
    )
    expect(screen.getByRole("status").textContent).toBe("authenticated|user-123|true")
  })

  test("starts unauthenticated when no snapshot is provided", () => {
    const { SessionProvider, useSession, useIsAuthenticated } = createSessionContext()
    function View(): ReactNode {
      return (
        <output>
          {useSession().status}|{String(useIsAuthenticated())}
        </output>
      )
    }
    render(
      <SessionProvider>
        <View />
      </SessionProvider>,
    )
    expect(screen.getByRole("status").textContent).toBe("unauthenticated|false")
  })
})
