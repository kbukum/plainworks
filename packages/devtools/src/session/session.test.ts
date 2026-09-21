import { isErr, isOk, type WebAbortSignal } from "@plainworks/std"
import { deferred, flushMicrotasks } from "@plainworks/testkit"
import { describe, expect, it, vi } from "vitest"
import { type Bridge, createMemoryBridge } from "../bridge"
import type { CommandDescriptor, DevtoolsMessage, SourceEvent, SourceId } from "../protocol"
import type { Source, SourceHandle, SourceObserver } from "../source"
import type { DevtoolsClientPort } from "./client-port"
import { createDevtoolsSession, type DevtoolsSession } from "./session"

interface Harness {
  readonly source: Source
  observer(): SourceObserver
  detailSignal(): WebAbortSignal | undefined
}

function harness(
  id: SourceId,
  options: {
    commands?: readonly CommandDescriptor[]
    resolveDetail?: (ref: string, signal: WebAbortSignal) => Promise<unknown>
    runCommand?: (id: string, input: unknown, signal: WebAbortSignal) => Promise<unknown>
    throwOnConnect?: boolean
    dispose?: () => void
  } = {},
): Harness {
  let observer: SourceObserver | undefined
  let detailSignal: WebAbortSignal | undefined
  const source: Source = {
    id,
    label: id.instance,
    ...(options.commands ? { commands: options.commands } : {}),
    connect(sink) {
      if (options.throwOnConnect) throw new Error("connect failed")
      observer = sink
      const resolveDetail = options.resolveDetail
      const handle: SourceHandle = {
        dispose: options.dispose ?? (() => {}),
        ...(resolveDetail
          ? {
              resolveDetail: (ref: string, signal: WebAbortSignal) => {
                detailSignal = signal
                return resolveDetail(ref, signal)
              },
            }
          : {}),
        ...(options.runCommand ? { runCommand: options.runCommand } : {}),
      }
      return handle
    },
  }
  return {
    source,
    observer: () => {
      if (!observer) throw new Error("source not connected")
      return observer
    },
    detailSignal: () => detailSignal,
  }
}

const httpId: SourceId = { kind: "http", instance: "api" }

function collect(session: DevtoolsSession): {
  messages: DevtoolsMessage[]
  port: DevtoolsClientPort
} {
  const port = session.connect()
  const messages: DevtoolsMessage[] = []
  port.subscribe((message) => messages.push(message))
  return { messages, port }
}

describe("createDevtoolsSession", () => {
  it("announces a source and forwards ordered, sanitized events", () => {
    const session = createDevtoolsSession()
    const { messages, port } = collect(session)
    const http = harness(httpId)
    session.registerSource(http.source)

    http.observer().emit({
      kind: "request",
      label: "GET /x",
      severity: "ok",
      at: 1,
      summary: { path: "/x", authorization: "Bearer secret" },
    })
    http.observer().emit({ kind: "request", label: "GET /y", severity: "ok", at: 2 })

    const events = messages.filter((m) => m.type === "event")
    expect(events.map((m) => (m.type === "event" ? m.seq : 0))).toEqual([1, 2])
    const first = events[0]
    if (first?.type === "event") {
      expect((first.event.summary as Record<string, unknown>).authorization).toBe("[REDACTED]")
    }
    expect(messages[0]?.type).toBe("source-added")

    const snapshot = port.snapshot()
    expect(snapshot.sources.map((s) => s.id.instance)).toEqual(["api"])
    expect(snapshot.events).toHaveLength(2)
  })

  it("replays current state to a client that connects after events", () => {
    const session = createDevtoolsSession()
    const http = harness(httpId)
    session.registerSource(http.source)
    http.observer().emit({ kind: "request", label: "GET /x", severity: "ok", at: 1 })

    const port = session.connect()
    const snapshot = port.snapshot()
    expect(snapshot.sources).toHaveLength(1)
    expect(snapshot.events).toHaveLength(1)
  })

  it("replays the latest indicators and clears them with their source", () => {
    const session = createDevtoolsSession()
    const http = harness(httpId)
    const registration = session.registerSource(http.source)
    http.observer().indicate({
      id: "auth",
      label: "Auth",
      value: "ready",
      severity: "ok",
      updatedAt: 5,
    })
    http.observer().indicate({
      id: "auth",
      label: "Auth",
      value: "stale",
      severity: "warn",
      updatedAt: 6,
    })

    expect(session.connect().snapshot().indicators).toEqual([
      {
        id: httpId,
        indicator: {
          id: "auth",
          label: "Auth",
          value: "stale",
          severity: "warn",
          updatedAt: 6,
        },
      },
    ])

    registration.unsubscribe()
    expect(session.connect().snapshot().indicators).toEqual([])
  })

  it("forwards sanitized indicators", () => {
    const session = createDevtoolsSession()
    const { messages } = collect(session)
    const http = harness(httpId)
    session.registerSource(http.source)

    http.observer().indicate({
      id: "auth",
      label: "Auth",
      value: "Bearer secret",
      severity: "warn",
      updatedAt: 5,
    })
    const indicator = messages.find((m) => m.type === "indicator")
    expect(indicator?.type === "indicator" && indicator.indicator.value).toBe("[REDACTED]")
  })

  it("reports dropped events when retention overflows", () => {
    const session = createDevtoolsSession({ retention: { perSource: 1, aggregate: 1 } })
    const { messages } = collect(session)
    const http = harness(httpId)
    session.registerSource(http.source)

    http.observer().emit({ kind: "r", label: "a", severity: "ok", at: 1 })
    http.observer().emit({ kind: "r", label: "b", severity: "ok", at: 2 })

    const dropped = messages.find((m) => m.type === "dropped" && m.id === null)
    expect(dropped?.type === "dropped" && dropped.count).toBe(1)
  })

  it("isolates a source failure and a throwing connect", () => {
    const session = createDevtoolsSession()
    const { messages } = collect(session)

    const bad = harness({ kind: "state", instance: "broken" }, { throwOnConnect: true })
    expect(() => session.registerSource(bad.source)).not.toThrow()

    const http = harness(httpId)
    session.registerSource(http.source)
    http.observer().fail(new Error("scrape failed"))

    const failures = messages.filter((m) => m.type === "source-failed")
    expect(failures).toHaveLength(2)
    const failure = failures[1]
    if (failure?.type === "source-failed") {
      expect(failure.error.message).toBe("scrape failed")
    }
  })

  it("redacts and serializes source and request errors", async () => {
    const session = createDevtoolsSession()
    const { messages, port } = collect(session)
    const sensitiveError = Object.assign(new Error("Authorization: ******"), {
      token: "live-secret",
      unsupported: undefined,
    })
    const commands: CommandDescriptor[] = [
      { id: "fail", label: "Fail", risk: "safe", available: true },
    ]
    const http = harness(httpId, {
      commands,
      resolveDetail: async () => {
        throw sensitiveError
      },
      runCommand: async () => {
        throw sensitiveError
      },
    })
    session.registerSource(http.source)

    http.observer().fail(sensitiveError)
    const detail = await port.requestDetail(httpId, "ref")
    const command = await port.runCommand(httpId, "fail", null)

    const failure = messages.find((message) => message.type === "source-failed")
    expect(failure?.type === "source-failed" && failure.error).toMatchObject({
      message: "Authorization: [REDACTED]",
      token: "[REDACTED]",
    })
    expect(isErr(detail) && detail.error.cause).toMatchObject({
      message: "Authorization: [REDACTED]",
      token: "[REDACTED]",
    })
    expect(isErr(command) && command.error.cause).toMatchObject({
      message: "Authorization: [REDACTED]",
      token: "[REDACTED]",
    })
  })

  it("rejects a duplicate source registration", () => {
    const session = createDevtoolsSession()
    session.registerSource(harness(httpId).source)
    expect(() => session.registerSource(harness(httpId).source)).toThrowError(/already registered/)
  })

  it("deregisters a source and forgets its history", () => {
    const session = createDevtoolsSession()
    const dispose = vi.fn()
    const http = harness(httpId, { dispose })
    const registration = session.registerSource(http.source)
    http.observer().emit({ kind: "r", label: "a", severity: "ok", at: 1 })

    registration.unsubscribe()
    expect(dispose).toHaveBeenCalledOnce()
    const port = session.connect()
    expect(port.snapshot().sources).toHaveLength(0)
    expect(port.snapshot().events).toHaveLength(0)
  })

  it("starts a clean timeline when a stable source identity reconnects", () => {
    const session = createDevtoolsSession()
    const first = harness(httpId)
    const registration = session.registerSource(first.source)
    first.observer().emit({ kind: "r", label: "old", severity: "ok", at: 1 })
    registration.unsubscribe()

    const reconnected = harness(httpId)
    session.registerSource(reconnected.source)
    reconnected.observer().emit({ kind: "r", label: "new", severity: "ok", at: 2 })

    expect(session.connect().snapshot().events).toMatchObject([{ seq: 1, event: { label: "new" } }])
  })

  it("ignores publications from a deregistered source", () => {
    const session = createDevtoolsSession()
    const { messages } = collect(session)
    const http = harness(httpId)
    const registration = session.registerSource(http.source)
    const observer = http.observer()
    registration.unsubscribe()
    const afterRemoval = messages.length

    observer.emit({ kind: "r", label: "late", severity: "ok", at: 1 })
    observer.indicate({
      id: "late",
      label: "Late",
      value: "late",
      severity: "warn",
      updatedAt: 1,
    })
    observer.fail(new Error("late"))

    expect(messages).toHaveLength(afterRemoval)
  })

  it("cancels a source's in-flight detail request when it is deregistered", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    const pending = deferred<unknown>()
    const http = harness(httpId, { resolveDetail: () => pending.promise })
    const registration = session.registerSource(http.source)

    const result = port.requestDetail(httpId, "ref-1")
    await flushMicrotasks()
    registration.unsubscribe()

    const settled = await result
    expect(isErr(settled)).toBe(true)
    expect(http.detailSignal()?.aborted).toBe(true)
  })

  it("resolves a detail request with a sanitized value", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    const http = harness(httpId, {
      resolveDetail: async () => ({ body: { token: "abc" }, ok: true }),
    })
    session.registerSource(http.source)

    const result = await port.requestDetail(httpId, "ref-1")
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.seq).toBe(0)
      expect((result.value.value as Record<string, Record<string, unknown>>).body?.token).toBe(
        "[REDACTED]",
      )
    }
  })

  it("returns a typed failure when a source cannot resolve detail", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    session.registerSource(harness(httpId).source)

    const result = await port.requestDetail(httpId, "ref-1")
    expect(isErr(result) && result.error.kind).toBe("devtools/request-failed")
  })

  it("cancels a detail request and aborts the source signal", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    const pending = deferred<unknown>()
    const http = harness(httpId, { resolveDetail: () => pending.promise })
    session.registerSource(http.source)

    const controller = new AbortController()
    const result = port.requestDetail(httpId, "ref-1", controller.signal)
    await flushMicrotasks()
    controller.abort()

    expect(isErr(await result) && (await result).ok).toBe(false)
    expect(http.detailSignal()?.aborted).toBe(true)
  })

  it("supersedes an earlier detail request for the same source", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    const first = deferred<unknown>()
    const http = harness(httpId, { resolveDetail: () => first.promise })
    session.registerSource(http.source)

    const earlier = port.requestDetail(httpId, "ref-1")
    const later = port.requestDetail(httpId, "ref-2")
    const earlyResult = await earlier
    expect(isErr(earlyResult) && earlyResult.error.kind).toBe("devtools/request-superseded")
    void later
  })

  it("keeps two client ports' concurrent requests from cross-settling", async () => {
    const dbId: SourceId = { kind: "db", instance: "primary" }
    const session = createDevtoolsSession()
    const portA = session.connect()
    const portB = session.connect()
    const httpDetail = deferred<unknown>()
    const dbDetail = deferred<unknown>()
    session.registerSource(harness(httpId, { resolveDetail: () => httpDetail.promise }).source)
    session.registerSource(harness(dbId, { resolveDetail: () => dbDetail.promise }).source)

    const fromA = portA.requestDetail(httpId, "ref-a")
    const fromB = portB.requestDetail(dbId, "ref-b")
    await flushMicrotasks()
    httpDetail.resolve({ who: "http" })
    dbDetail.resolve({ who: "db" })

    const [a, b] = await Promise.all([fromA, fromB])
    expect(isOk(a) && (a.value.value as Record<string, unknown>).who).toBe("http")
    expect(isOk(b) && (b.value.value as Record<string, unknown>).who).toBe("db")
  })

  it("runs an available command and refuses an unavailable one", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    const commands: CommandDescriptor[] = [
      { id: "reset", label: "Reset", risk: "destructive", available: true },
      { id: "wipe", label: "Wipe", risk: "destructive", available: false },
    ]
    const runCommand = vi.fn(async () => ({ done: true }))
    session.registerSource(harness(httpId, { commands, runCommand }).source)

    const ran = await port.runCommand(httpId, "reset", { force: true })
    expect(isOk(ran)).toBe(true)
    expect(runCommand).toHaveBeenCalledWith("reset", { force: true }, expect.anything())

    const refused = await port.runCommand(httpId, "wipe", null)
    expect(isErr(refused)).toBe(true)
  })

  it("releases every resource on dispose", async () => {
    const session = createDevtoolsSession()
    const port = session.connect()
    const disposeSpy = vi.fn()
    const pending = deferred<unknown>()
    const http = harness(httpId, { dispose: disposeSpy, resolveDetail: () => pending.promise })
    session.registerSource(http.source)

    const inFlight = port.requestDetail(httpId, "ref-1")
    await flushMicrotasks()

    const seen: DevtoolsMessage[] = []
    port.subscribe((message) => seen.push(message))
    session.dispose()

    expect(disposeSpy).toHaveBeenCalledOnce()
    expect(http.detailSignal()?.aborted).toBe(true)
    expect(seen.some((m) => m.type === "disposed")).toBe(true)
    const settled = await inFlight
    expect(isErr(settled) && settled.error.kind).toBe("devtools/session-disposed")

    expect(() => session.registerSource(harness({ kind: "x", instance: "y" }).source)).toThrow()
    expect(() => session.connect()).toThrowError(/disposed/)
    const afterDispose = await port.requestDetail(httpId, "ref-2")
    expect(isErr(afterDispose) && afterDispose.error.kind).toBe("devtools/session-disposed")
  })

  it("unsubscribes host and client listeners on terminal disposal", () => {
    const memory = createMemoryBridge()
    const hostUnsubscribe = vi.fn()
    const clientUnsubscribe = vi.fn()
    const bridge: Bridge = {
      host: {
        post: memory.host.post,
        subscribe(listener) {
          const subscription = memory.host.subscribe(listener)
          return {
            unsubscribe() {
              hostUnsubscribe()
              subscription.unsubscribe()
            },
          }
        },
      },
      client: {
        post: memory.client.post,
        subscribe(listener) {
          const subscription = memory.client.subscribe(listener)
          return {
            unsubscribe() {
              clientUnsubscribe()
              subscription.unsubscribe()
            },
          }
        },
      },
      dispose: memory.dispose,
    }
    const session = createDevtoolsSession({ bridge })
    session.connect()

    session.dispose()

    expect(hostUnsubscribe).toHaveBeenCalledOnce()
    expect(clientUnsubscribe).toHaveBeenCalledOnce()
  })

  it("emits only serializable frames", () => {
    const session = createDevtoolsSession()
    const { messages } = collect(session)
    const http = harness(httpId)
    session.registerSource(http.source)
    http.observer().emit({
      kind: "r",
      label: "a",
      severity: "ok",
      at: 1,
      summary: { fn: () => 1, nested: { when: new Date(0) } },
    } as unknown as SourceEvent)

    for (const message of messages) {
      expect(() => JSON.stringify(message)).not.toThrow()
    }
    const event = messages.find((m) => m.type === "event")
    if (event?.type === "event") {
      expect((event.event.summary as Record<string, unknown>).fn).toBe("[Function]")
    }
  })
})
