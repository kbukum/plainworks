import { QueryClient } from "@tanstack/query-core"
import { describe, expect, it } from "vitest"
import { createDevtoolsSession, type DevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { createQuerySource } from "./query-source"

function setup(options: Parameters<typeof createQuerySource>[0]) {
  const session = createDevtoolsSession()
  const source = createQuerySource(options)
  session.registerSource(source)
  const port = session.connect()
  return { session, source, port }
}

describe("createQuerySource", () => {
  it("identifies the client instance explicitly", () => {
    const session: DevtoolsSession = createDevtoolsSession()
    session.registerSource(createQuerySource({ client: new QueryClient(), instance: "main" }))
    session.registerSource(createQuerySource({ client: new QueryClient(), instance: "admin" }))
    const snapshot = session.connect().snapshot()
    expect(snapshot.sources.map((source) => source.id)).toEqual([
      { kind: "query", instance: "main" },
      { kind: "query", instance: "admin" },
    ])
  })

  it("emits a lifecycle event for a successful fetch", async () => {
    const client = new QueryClient()
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: async () => ["a"] })
    const kinds = port.snapshot().events.map((entry) => entry.event.kind)
    expect(kinds).toContain("query.success")
    const success = port.snapshot().events.find((entry) => entry.event.kind === "query.success")
    expect(success?.event.label).toContain("tasks")
    expect(success?.event.severity).toBe("ok")
  })

  it("emits the fetch and success lifecycle events directly, without collapsing terminals", async () => {
    const client = new QueryClient()
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: async () => ["a"] })
    const kinds = port.snapshot().events.map((entry) => entry.event.kind)
    expect(kinds).toContain("query.fetch")
    expect(kinds).toContain("query.success")
  })

  it("keeps terminal events of concurrent queries instead of coalescing them away", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await Promise.all([
      client.fetchQuery({ queryKey: ["a"], queryFn: async () => 1 }),
      client.fetchQuery({ queryKey: ["b"], queryFn: async () => 2 }),
      client
        .fetchQuery({
          queryKey: ["c"],
          queryFn: async () => {
            throw new Error("boom")
          },
        })
        .catch(() => {}),
    ])
    const terminals = port
      .snapshot()
      .events.filter(
        (entry) => entry.event.kind === "query.success" || entry.event.kind === "query.error",
      )
      .map((entry) => entry.event.label)
    expect(terminals).toContain("Fetched a")
    expect(terminals).toContain("Fetched b")
    expect(terminals).toContain("Failed c")
  })

  it("uses safe key labels and opaque detail tokens to protect sensitive query keys", async () => {
    const client = new QueryClient()
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client.fetchQuery({
      queryKey: ["users", { secretToken: "super-secret" }],
      queryFn: async () => ({ id: 1 }),
    })
    const success = port.snapshot().events.find((entry) => entry.event.kind === "query.success")
    expect(success?.event.label).toBe("Fetched users")
    expect(success?.event.label).not.toContain("super-secret")
    expect(success?.event.detail).toMatch(/^q\d+$/)
    expect(success?.event.detail).not.toContain("super-secret")
    expect(success?.event.detail).not.toContain("users")
  })

  it("supports an explicit caller-controlled keyLabel projection", async () => {
    const client = new QueryClient()
    const { port } = setup({
      client,
      instance: "main",
      now: () => 1_000,
      keyLabel: (key) => `custom-${Array.isArray(key) ? key[0] : key}`,
    })
    await client.fetchQuery({ queryKey: ["items"], queryFn: async () => [] })
    const success = port.snapshot().events.find((entry) => entry.event.kind === "query.success")
    expect(success?.event.label).toBe("Fetched custom-items")
  })

  it("emits an error event for a failed fetch", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client
      .fetchQuery({
        queryKey: ["broken"],
        queryFn: async () => {
          throw new Error("request failed")
        },
      })
      .catch(() => {})
    const failure = port.snapshot().events.find((entry) => entry.event.kind === "query.error")
    expect(failure?.event.severity).toBe("error")
    expect(failure?.event.label).toContain("broken")
  })

  it("masks non-Error thrown values in events and on-demand detail", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client
      .fetchQuery({
        queryKey: ["broken"],
        queryFn: async () => {
          throw "secret-payload"
        },
      })
      .catch(() => {})

    const failure = port.snapshot().events.find((entry) => entry.event.kind === "query.error")
    expect(failure?.event.summary).toEqual({ error: "Unknown error" })
    const detail = await port.requestDetail(
      { kind: "query", instance: "main" },
      failure?.event.detail ?? "",
    )
    expect(JSON.stringify(detail)).not.toContain("secret-payload")
  })

  it("emits mutation start on execution, not on cache insertion, then success", async () => {
    const client = new QueryClient()
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ["createTask"],
      mutationFn: async () => "done",
    })

    // A built-but-unexecuted mutation is only inserted into the cache; it has not started.
    const kindsAfterBuild = port.snapshot().events.map((entry) => entry.event.kind)
    expect(kindsAfterBuild).not.toContain("mutation.start")

    await mutation.execute(undefined)
    const kinds = port.snapshot().events.map((entry) => entry.event.kind)
    expect(kinds).toContain("mutation.start")
    expect(kinds.indexOf("mutation.start")).toBeLessThan(kinds.indexOf("mutation.success"))
  })

  it("publishes an aggregate health indicator without serializing the cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: async () => ["a"] })
    await client
      .fetchQuery({
        queryKey: ["broken"],
        queryFn: async () => {
          throw new Error("boom")
        },
      })
      .catch(() => {})
    const indicator = port.snapshot().indicators.find((entry) => entry.indicator.id === "queries")
    expect(indicator?.indicator.severity).toBe("error")
    expect(indicator?.indicator.value).toContain("1 failing")
    expect(indicator?.indicator.target).toBe("query")
  })

  it("resolves a query's full state on demand, sanitized by the session", async () => {
    const client = new QueryClient()
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client.fetchQuery({
      queryKey: ["profile"],
      queryFn: async () => ({ name: "Ada", token: "secret-token-value" }),
    })
    const withDetail = port.snapshot().events.find((entry) => entry.event.detail !== undefined)
    expect(withDetail).toBeDefined()
    const result = await port.requestDetail(
      { kind: "query", instance: "main" },
      withDetail?.event.detail ?? "",
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const text = JSON.stringify(result.value.value)
      expect(text).toContain("Ada")
      expect(text).not.toContain("secret-token-value")
    }
  })

  it("stops observing after teardown", async () => {
    const client = new QueryClient()
    const session = createDevtoolsSession()
    const registration = session.registerSource(
      createQuerySource({ client, instance: "main", now: () => 1_000 }),
    )
    const port = session.connect()
    registration.unsubscribe()
    await client.fetchQuery({ queryKey: ["late"], queryFn: async () => 1 })
    expect(port.snapshot().events).toHaveLength(0)
  })

  it("keeps other sources running when the cache read fails", async () => {
    const client = new QueryClient()
    const session = createDevtoolsSession()
    const healthy = fakeSource({ kind: "state", instance: "cart" }, { label: "Cart" })
    session.registerSource(healthy)
    session.registerSource(createQuerySource({ client, instance: "main", now: () => 1_000 }))
    const port = session.connect()
    client.getQueryCache().getAll = () => {
      throw new Error("cache corrupted")
    }
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: async () => 1 })
    const failures = port.snapshot().failures
    expect(failures).toHaveLength(1)
    expect(failures[0]?.id).toEqual({ kind: "query", instance: "main" })
    healthy.emit({ kind: "change", label: "still fine", severity: "ok", at: 1 })
    expect(port.snapshot().events.some((entry) => entry.event.label === "still fine")).toBe(true)
  })

  it("isolates a throwing keyLabel through the observer instead of the cache path", async () => {
    const client = new QueryClient()
    const { port } = setup({
      client,
      instance: "main",
      now: () => 1_000,
      keyLabel: () => {
        throw new Error("label blew up")
      },
    })
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: async () => 1 })
    const failures = port.snapshot().failures
    expect(failures).toHaveLength(1)
    expect(failures[0]?.id).toEqual({ kind: "query", instance: "main" })
  })

  it("reuses one opaque detail id across a query's refetches", async () => {
    const client = new QueryClient()
    const { port } = setup({ client, instance: "main", now: () => 1_000 })
    await client.fetchQuery({ queryKey: ["tasks"], queryFn: async () => 1 })
    await client.refetchQueries({ queryKey: ["tasks"] })
    const detailIds = new Set(
      port
        .snapshot()
        .events.filter((entry) => entry.event.kind === "query.success")
        .map((entry) => entry.event.detail),
    )
    expect(detailIds.size).toBe(1)
  })

  it("clears a source failure after the next healthy cycle", async () => {
    const client = new QueryClient()
    let broken = true
    const { port } = setup({
      client,
      instance: "main",
      now: () => 1_000,
      keyLabel: (key) => {
        if (broken) throw new Error("label blew up")
        return Array.isArray(key) ? String(key[0]) : "query"
      },
    })
    await client.fetchQuery({ queryKey: ["a"], queryFn: async () => 1 })
    expect(port.snapshot().failures).toHaveLength(1)
    broken = false
    await client.fetchQuery({ queryKey: ["b"], queryFn: async () => 2 })
    expect(port.snapshot().failures).toHaveLength(0)
  })
})
