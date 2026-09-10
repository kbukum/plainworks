// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { createApp } from "../index"
import { renderWithProviders } from "../testing"
import { fakeSessionCapability, useFakeSession } from "./capability-fakes"

afterEach(cleanup)

function Greeting(): ReactNode {
  const session = useFakeSession()
  return createElement(
    "p",
    null,
    session.status === "authenticated" ? `Hi ${session.name}` : "Guest",
  )
}

describe("renderWithProviders (published-surface assembly)", () => {
  it("mounts the client capabilities and hydrates from a server-resolved snapshot", async () => {
    // Consumer-first / quickstart-is-tested: resolve the neutral halves with the published
    // `createApp`, then render the client halves through `renderWithProviders` — no `app/src`
    // internal is reached.
    const session = fakeSessionCapability()
    const app = createApp({ capabilities: [session.resolve] })
    const snapshot = await app.resolve({ headers: new Headers({ cookie: "session=Ada" }) })
    const result = renderWithProviders(createElement(Greeting), {
      capabilities: [session.provider],
      snapshot,
    })
    expect(screen.getByText("Hi Ada")).toBeDefined()
    expect(result.capabilities).toEqual([session.provider])
  })

  it("renders the unresolved default when no snapshot is supplied", () => {
    const session = fakeSessionCapability()
    renderWithProviders(createElement(Greeting), { capabilities: [session.provider] })
    expect(screen.getByText("Guest")).toBeDefined()
  })
})
