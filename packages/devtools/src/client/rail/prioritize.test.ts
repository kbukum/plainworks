import { describe, expect, it } from "vitest"
import type { SourceDescriptor, SourceId } from "../../protocol"
import type { IndicatorEntry } from "../../session/client-port"
import { buildRailEntries, splitRailOverflow } from "./prioritize"

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

describe("buildRailEntries", () => {
  it("sorts by severity first, then by freshness", () => {
    const entries = buildRailEntries({
      sources: [descriptor(http), descriptor(query)],
      failures: new Map(),
      droppedAggregate: 0,
      indicators: [
        indicator(query, "fresh", "ok", 900),
        indicator(http, "stale-cache", "warn", 100),
        indicator(http, "recent", "info", 950),
      ],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entries.map((entry) => entry.value)).toEqual(["stale-cache", "recent", "fresh"])
  })

  it("orders indicators of equal severity by freshness rather than key", () => {
    const entries = buildRailEntries({
      sources: [descriptor(http), descriptor(query)],
      failures: new Map(),
      droppedAggregate: 0,
      indicators: [indicator(http, "older", "warn", 200), indicator(query, "newer", "warn", 800)],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entries.map((entry) => entry.value)).toEqual(["newer", "older"])
  })

  it("places error indicators before the synthesized dropped warning", () => {
    const entries = buildRailEntries({
      sources: [descriptor(http)],
      failures: new Map(),
      droppedAggregate: 5,
      indicators: [indicator(http, "critical", "error", 900)],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entries[0]?.severity).toBe("error")
    expect(entries[0]?.value).toBe("critical")
    expect(entries[1]?.severity).toBe("warn")
    expect(entries[1]?.value).toBe("5 dropped")
  })

  it("marks an indicator stale when it is older than the freshness window", () => {
    const [entry] = buildRailEntries({
      sources: [descriptor(http)],
      failures: new Map(),
      droppedAggregate: 0,
      indicators: [indicator(http, "old", "ok", 100)],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entry?.stale).toBe(true)
    expect(entry?.label).toBe("HTTP")
  })

  it("turns a source failure into an error entry that targets the source kind", () => {
    const entries = buildRailEntries({
      sources: [descriptor(http, "HTTP api"), descriptor(query)],
      failures: new Map([["4:httpapi", { name: "PlainError", message: "boom" }]]),
      droppedAggregate: 0,
      indicators: [indicator(query, "healthy", "ok", 1_000)],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entries[0]).toMatchObject({
      label: "HTTP api",
      value: "Failed",
      severity: "error",
      stale: false,
      target: "http",
    })
  })

  it("carries the indicator target so activation opens the right view", () => {
    const [entry] = buildRailEntries({
      sources: [descriptor(query)],
      failures: new Map(),
      droppedAggregate: 0,
      indicators: [indicator(query, "3 stale", "warn", 1_000, "query")],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entry?.target).toBe("query")
  })

  it("synthesizes a warning entry for dropped events, targeting the timeline", () => {
    const entries = buildRailEntries({
      sources: [descriptor(http)],
      failures: new Map(),
      droppedAggregate: 12,
      indicators: [],
      now: 1_000,
      staleAfterMs: 500,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      label: "Timeline",
      value: "12 dropped",
      severity: "warn",
      target: "timeline",
    })
  })
})

describe("splitRailOverflow", () => {
  const entries = buildRailEntries({
    sources: [descriptor(http)],
    failures: new Map(),
    droppedAggregate: 0,
    indicators: [
      indicator(http, "one", "error", 5),
      indicator(http, "two", "warn", 4),
      indicator(http, "three", "ok", 3),
    ],
    now: 5,
    staleAfterMs: 100,
  })

  it("keeps everything visible at or under the cap", () => {
    const split = splitRailOverflow(entries, 3)
    expect(split.visible).toHaveLength(3)
    expect(split.overflowCount).toBe(0)
  })

  it("collapses the lowest-priority entries into an overflow count", () => {
    const split = splitRailOverflow(entries, 2)
    expect(split.visible.map((entry) => entry.value)).toEqual(["one", "two"])
    expect(split.overflowCount).toBe(1)
  })
})
