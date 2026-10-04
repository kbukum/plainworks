// @vitest-environment jsdom
// Client tests opt into jsdom per file; the package default stays `node` so the neutral `.` and
// `./server` entries can never lean on a DOM global unnoticed.
import type { Identity } from "@plainworks/std/seam"
import { fixedClock } from "@plainworks/std/time"
import type { WebFetch, WebResponse } from "@plainworks/std/web"
import { deferred, flushMicrotasks } from "@plainworks/testkit"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { act, cleanup, render, screen } from "@testing-library/react"
import { type ReactNode, StrictMode } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { type AuthStore, createAuthStore, type SessionSnapshot } from "../session"
import { createSessionContext, useSessionOwner } from "./session-context"

afterEach(cleanup)

const identity: Identity = { subject: "user-123", claims: { name: "Ada" } }
const published = {
  status: "authenticated",
  identity: { subject: "user-123", kind: "user", restrictions: { mode: "unrestricted" } },
  expiresAt: "2099-01-01T01:00:00Z",
  csrfToken: "csrf-proof",
}

function store(fetch: WebFetch, initialSnapshot?: SessionSnapshot): AuthStore {
  return createAuthStore({
    fetch,
    clock: fixedClock("2099-01-01T00:00:00Z"),
    ...(initialSnapshot === undefined ? {} : { initialSnapshot }),
  })
}

const { SessionProvider, useSession, useIdentity, useIsAuthenticated } = createSessionContext()

function View(): ReactNode {
  return (
    <output>
      {useSession().status}|{useIdentity()?.subject ?? "none"}|{String(useIsAuthenticated())}
    </output>
  )
}

function Root({ runtime, children }: { runtime: AuthStore; children: ReactNode }): ReactNode {
  useSessionOwner(runtime)
  return children
}

describe("createSessionContext", () => {
  test("renders the borrowed runtime's hydration snapshot first", async () => {
    const runtime = store(vi.fn(), { status: "authenticated", identity })
    const { container } = render(
      <SessionProvider runtime={runtime}>
        <View />
      </SessionProvider>,
    )
    expect(screen.getByRole("status")).toMatchObject({ textContent: "authenticated|user-123|true" })
    await expectNoAxeViolations(container)
  })

  test("a leaf provider neither checks status nor ends the shared lifetime when it unmounts", async () => {
    const fetch = vi.fn<WebFetch>(async () => Response.json(published))
    const runtime = store(fetch)
    await runtime.revalidate()
    const lease = await runtime.protectedSession.acquire()
    const leaf = (
      <SessionProvider runtime={runtime}>
        <View />
      </SessionProvider>
    )
    const { rerender } = render(leaf)
    rerender(null)
    rerender(leaf)
    expect(screen.getByRole("status")).toMatchObject({ textContent: "authenticated|user-123|true" })
    expect(lease.signal.aborted).toBe(false)
    expect(fetch).toHaveBeenCalledOnce()
    runtime.close()
  })

  test("replacing the borrowed runtime follows the new snapshot", () => {
    const first = store(vi.fn(), { status: "authenticated", identity })
    const second = store(vi.fn())
    const { rerender } = render(
      <SessionProvider runtime={first}>
        <View />
      </SessionProvider>,
    )
    rerender(
      <SessionProvider runtime={second}>
        <View />
      </SessionProvider>,
    )
    expect(screen.getByRole("status")).toMatchObject({ textContent: "unauthenticated|none|false" })
  })
})

describe("useSessionOwner", () => {
  test("StrictMode replay keeps one live lifetime after the authoritative check", async () => {
    const fetch = vi.fn<WebFetch>(async () => Response.json(published))
    const runtime = store(fetch)
    render(
      <StrictMode>
        <Root runtime={runtime}>
          <SessionProvider runtime={runtime}>
            <View />
          </SessionProvider>
        </Root>
      </StrictMode>,
    )
    await act(flushMicrotasks)
    expect(screen.getByRole("status")).toMatchObject({ textContent: "authenticated|user-123|true" })
    const lease = await runtime.protectedSession.acquire()
    expect(lease.signal.aborted).toBe(false)
    runtime.close()
  })

  test("a signed-out server seed is already the answer, so the owner sends no request", async () => {
    const fetch = vi.fn<WebFetch>()
    const runtime = store(fetch, { status: "unauthenticated", identity: null })
    render(<Root runtime={runtime}>{null}</Root>)
    await act(flushMicrotasks)
    expect(fetch).not.toHaveBeenCalled()
    expect(runtime.getSnapshot().status).toBe("unauthenticated")
    runtime.close()
  })

  test("a signed-in server seed is confirmed once before protected work", async () => {
    const fetch = vi.fn<WebFetch>(async () => Response.json(published))
    const runtime = store(fetch, { status: "authenticated", identity })
    render(<Root runtime={runtime}>{null}</Root>)
    await act(flushMicrotasks)
    expect(fetch).toHaveBeenCalledOnce()
    expect(runtime.getSnapshot().expiresAt).toBe(published.expiresAt)
    runtime.close()
  })

  test("real teardown cancels the held status check and protected work", async () => {
    const held = deferred<WebResponse>()
    let calls = 0
    const runtime = store(async () => (calls++ === 0 ? Response.json(published) : held.promise))
    await runtime.revalidate()
    const lease = await runtime.protectedSession.acquire()
    const { unmount } = render(
      <Root runtime={runtime}>
        <SessionProvider runtime={runtime}>
          <View />
        </SessionProvider>
      </Root>,
    )
    await act(flushMicrotasks)
    const pending = runtime.revalidate()
    unmount()
    await expect(pending).rejects.toMatchObject({ kind: "std/aborted" })
    expect(lease.signal.aborted).toBe(true)
    held.resolve(Response.json(published))
  })
})
