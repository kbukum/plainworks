// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { DetailPanel } from "./detail-panel"

const http: SourceId = { kind: "http", instance: "api" }

afterEach(cleanup)

function setup(script: Parameters<typeof fakeSource>[1] = {}) {
  const session = createDevtoolsSession()
  session.registerSource(fakeSource(http, { label: "HTTP api", ...script }))
  const port = session.connect()
  return { session, port }
}

describe("DetailPanel", () => {
  it("loads and renders the resolved detail", async () => {
    const { port } = setup({
      resolveDetail: (ref) => ({ ref, headers: { accept: "json" } }),
    })
    render(<DetailPanel port={port} source={http} detailRef="req-1" />)
    expect(screen.getByRole("status")).toBeTruthy()
    expect(await screen.findByText("headers")).toBeTruthy()
    expect(screen.getByText('"req-1"')).toBeTruthy()
  })

  it("announces a resolution failure", async () => {
    const { port } = setup({
      resolveDetail: () => {
        throw new Error("detail store unavailable")
      },
    })
    render(<DetailPanel port={port} source={http} detailRef="req-1" />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("detail store unavailable")
  })

  it("reports when the source exposes no detail", async () => {
    const { port } = setup()
    render(<DetailPanel port={port} source={http} detailRef="req-1" />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("No detail available")
  })

  it("refetches when the detail ref changes", async () => {
    const { port } = setup({ resolveDetail: (ref) => ({ ref }) })
    const { rerender } = render(<DetailPanel port={port} source={http} detailRef="req-1" />)
    expect(await screen.findByText('"req-1"')).toBeTruthy()
    rerender(<DetailPanel port={port} source={http} detailRef="req-2" />)
    expect(await screen.findByText('"req-2"')).toBeTruthy()
  })

  it("renders nothing instead of an endless spinner when the request is superseded", async () => {
    let resolveDetail1: (val: unknown) => void = () => {}
    const delay1 = new Promise((resolve) => {
      resolveDetail1 = resolve
    })
    const { port } = setup({
      resolveDetail: (ref) => (ref === "req-1" ? delay1 : { ref: "req-2" }),
    })
    const { container: c1 } = render(<DetailPanel port={port} source={http} detailRef="req-1" />)
    expect(c1.querySelector("[role='status']")).toBeTruthy()

    // A second request for the same source supersedes the first on the port
    render(<DetailPanel port={port} source={http} detailRef="req-2" />)
    await screen.findByText('"req-2"')

    // First panel is superseded and transitions cleanly to null
    expect(c1.firstChild).toBeNull()
    resolveDetail1({ ref: "req-1" })
  })

  it("passes axe in the loaded state", async () => {
    const { port } = setup({ resolveDetail: () => ({ ok: true }) })
    const { container } = render(<DetailPanel port={port} source={http} detailRef="req-1" />)
    await screen.findByText("true")
    await expectNoAxeViolations(container)
  })
})
