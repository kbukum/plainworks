import { convergenceFixture, listsFixture } from "@plainworks/mocks/stream"
import { isCursorResult, isPaginatedResult } from "@plainworks/std/list"
import { deferred, flushMicrotasks, manualDelay } from "@plainworks/testkit"
import { describe, expect, it } from "vitest"
import { createQueryClient } from "../query-client"
import { createLiveQuery } from "./live-query"

describe("published convergence operations on the real cache", () => {
  for (const fixture of convergenceFixture.cases) {
    if (!fixture.operations.some((operation) => operation.kind === "snapshotStart")) continue
    it(fixture.name, async () => {
      const client = createQueryClient()
      const delay = manualDelay()
      const requests: ReturnType<typeof deferred<number>>[] = []
      const signal = new AbortController().signal
      let accepted = 0
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success") accepted++
      })
      const live = createLiveQuery(
        client,
        {
          queryKey: ["snapshot"],
          queryFn: () => {
            const request = deferred<number>()
            requests.push(request)
            return request.promise
          },
        },
        {
          maxRefetches: convergenceFixture.maxRefetches,
          delay: delay.delay,
          backoff: { baseMs: 10, maxMs: 10, factor: 1, jitter: "none" },
        },
      )
      let completed = 0
      for (const operation of fixture.operations) {
        switch (operation.kind) {
          case "snapshotStart":
            if (live.status === "waiting") live.connected(signal)
            delay.fireWhere((ms) => ms === 10)
            break
          case "snapshotComplete":
            requests[completed++]?.resolve(completed)
            break
          case "apply":
            live.deliver({ type: "updated", data: {} }, signal)
            break
          case "reset":
            live.reset(signal)
            break
        }
        await flushMicrotasks()
        await flushMicrotasks()
      }
      expect(requests).toHaveLength(fixture.want.refetches)
      expect(accepted).toBe(fixture.want.accepted)
      expect(live.status).toBe(fixture.want.dirty ? "stale" : "fresh")
      live.close()
      unsubscribe()
      client.clear()
      expect(delay.pending).toHaveLength(0)
    })
  }
})

it.each(listsFixture)("decodes the published $name list without app conversion", (fixture) => {
  const isRow = (value: unknown): value is { id: number } =>
    typeof value === "object" && value !== null && "id" in value && typeof value.id === "number"
  expect(
    fixture.mode === "cursor"
      ? isCursorResult(fixture.expected, isRow)
      : isPaginatedResult(fixture.expected, isRow),
  ).toBe(true)
})
