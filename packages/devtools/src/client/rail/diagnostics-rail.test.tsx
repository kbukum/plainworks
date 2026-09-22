// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type SourceDescriptor, type SourceId, sourceKey } from "../../protocol"
import type { IndicatorEntry } from "../../session/client-port"
import { DiagnosticsRail } from "./diagnostics-rail"

const http: SourceId = { kind: "http", instance: "api" }
const query: SourceId = { kind: "query", instance: "main" }

function descriptor(id: SourceId, label = `${id.kind} ${id.instance}`): SourceDescriptor {
  return { id, label, commands: [] }
}

function indicator(
  id: SourceId,
  value: string,
  severity: "ok" | "info" | "warn" | "error",
  updatedAt: number,
  target?: string,
): IndicatorEntry {
  return {
    id,
    indicator: {
      id: `${id.kind}-health`,
      label: id.kind.toUpperCase(),
      value,
      severity,
      updatedAt,
      ...(target === undefined ? {} : { target }),
    },
  }
}

function renderRail(overrides: Partial<Parameters<typeof DiagnosticsRail>[0]> = {}) {
  const onOpen = vi.fn()
  const utils = render(
    <DiagnosticsRail
      sources={[descriptor(http, "HTTP api"), descriptor(query, "Query main")]}
      failures={new Map()}
      indicators={[indicator(http, "2 in flight", "info", 1_000, "http")]}
      droppedAggregate={0}
      now={() => 1_000}
      staleAfterMs={500}
      tickMs={0}
      onOpen={onOpen}
      {...overrides}
    />,
  )
  return { onOpen, ...utils }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("DiagnosticsRail", () => {
  it("renders a named region with one button per prioritized indicator", () => {
    renderRail()
    expect(screen.getByRole("region", { name: "Diagnostics" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "HTTP: 2 in flight" })).toBeTruthy()
  })

  it("opens the indicator's target view on activation", async () => {
    const user = userEvent.setup()
    const { onOpen } = renderRail()
    await user.click(screen.getByRole("button", { name: "HTTP: 2 in flight" }))
    expect(onOpen).toHaveBeenCalledWith("http")
  })

  it("announces stale values", () => {
    renderRail({ now: () => 10_000 })
    expect(screen.getByRole("button", { name: /HTTP: 2 in flight \(stale\)/ })).toBeTruthy()
  })

  it("fades into staleness as the freshness clock ticks", () => {
    vi.useFakeTimers()
    let current = 1_000
    renderRail({ now: () => current, tickMs: 250 })
    expect(screen.queryByRole("button", { name: /stale/ })).toBeNull()
    current = 2_000
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByRole("button", { name: /stale/ })).toBeTruthy()
  })

  it("surfaces a source failure as an error entry opening the source kind", async () => {
    const user = userEvent.setup()
    const { onOpen } = renderRail({
      failures: new Map([[sourceKey(http), { name: "PlainError", message: "boom" }]]),
    })
    const failure = screen.getByRole("button", { name: "HTTP api: Failed" })
    await user.click(failure)
    expect(onOpen).toHaveBeenCalledWith("http")
  })

  it("collapses lower-priority entries behind an overflow disclosure", async () => {
    const user = userEvent.setup()
    const { onOpen } = renderRail({
      maxVisible: 1,
      indicators: [
        indicator(http, "2 in flight", "info", 1_000, "http"),
        indicator(query, "3 stale", "warn", 1_000, "query"),
      ],
    })
    expect(screen.queryByRole("button", { name: /HTTP:/ })).toBeNull()
    const overflow = screen.getByRole("button", { name: "Show 1 more diagnostic" })
    await user.click(overflow)
    expect(onOpen).toHaveBeenCalledWith(undefined)
  })

  it("renders nothing when there are no signals", () => {
    const { container } = renderRail({ sources: [], indicators: [] })
    expect(screen.queryByRole("region")).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  it("passes axe with entries, overflow, and a failure", async () => {
    const { container } = renderRail({
      maxVisible: 1,
      failures: new Map([[sourceKey(http), { name: "PlainError", message: "boom" }]]),
      indicators: [
        indicator(http, "2 in flight", "info", 1_000),
        indicator(query, "3 stale", "warn", 1_000),
      ],
    })
    await expectNoAxeViolations(container)
  })
})
