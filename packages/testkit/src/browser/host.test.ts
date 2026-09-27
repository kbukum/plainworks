import { describe, expect, it } from "vitest"
import type { BrowserGateHost, GateHostRuntime, SpawnedHost } from "./host"
import { startGateHost } from "./host"

const HOST: BrowserGateHost = {
  command: ["bun", "run", "server.ts"],
  env: ({ origin }) => ({ APP_ORIGIN: origin }),
  basePort: 5200,
  readyPath: "/ready",
  warmPaths: ["/", "/tasks"],
  startTimeoutMs: 1_000,
}

interface FakeHost {
  readonly runtime: GateHostRuntime
  readonly requests: string[]
  readonly signals: string[]
  readonly spawned: { command: string; args: readonly string[]; env: Record<string, string> }[]
  exit(code: number | null): void
}

// A scripted host: `readyAfter` probes fail before the host answers; a virtual clock advances by
// each sleep, so a start timeout needs no real waiting.
function fakeHost(script: {
  alreadyServing?: boolean
  readyAfter?: number
  exitOnStart?: number
  exitOnSignal?: "SIGTERM" | "SIGKILL"
  failWarm?: boolean
}): FakeHost {
  let clock = 0
  let probes = 0
  let started = false
  let resolveExit: (code: number | null) => void = () => {}
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve
  })
  const requests: string[] = []
  const signals: string[] = []
  const spawned: FakeHost["spawned"] = []
  const child: SpawnedHost = {
    exited,
    output: () => "host log tail",
    kill: (signal) => {
      signals.push(signal)
      if (signal === (script.exitOnSignal ?? "SIGTERM")) resolveExit(null)
    },
  }
  const runtime: GateHostRuntime = {
    spawn: (command, args, options) => {
      started = true
      spawned.push({ command, args, env: { ...options.env } })
      if (script.exitOnStart !== undefined) resolveExit(script.exitOnStart)
      return child
    },
    fetch: async (url) => {
      requests.push(url)
      const path = new URL(url).pathname
      if (path === "/ready") {
        if (!started) {
          if (script.alreadyServing === true) return new Response("stale")
          throw new TypeError("connection refused")
        }
        probes += 1
        if (probes <= (script.readyAfter ?? 0)) throw new TypeError("connection refused")
        return new Response("ok")
      }
      if (script.failWarm === true) throw new TypeError("socket hang up")
      return new Response(null, { status: 302 })
    },
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
  }
  return { runtime, requests, signals, spawned, exit: resolveExit }
}

describe("startGateHost", () => {
  it("starts the host on its port, waits for it, and warms each path once", async () => {
    const fake = fakeHost({ readyAfter: 2 })
    const host = await startGateHost(HOST, 5203, fake.runtime)
    expect(host.origin).toBe("http://127.0.0.1:5203")
    expect(fake.spawned).toEqual([
      {
        command: "bun",
        args: ["run", "server.ts"],
        env: { PORT: "5203", APP_ORIGIN: "http://127.0.0.1:5203" },
      },
    ])
    expect(fake.requests.slice(-2)).toEqual([
      "http://127.0.0.1:5203/",
      "http://127.0.0.1:5203/tasks",
    ])
  })

  it("refuses a port a stale server already answers on, instead of testing that server", async () => {
    const fake = fakeHost({ alreadyServing: true })
    await expect(startGateHost(HOST, 5200, fake.runtime)).rejects.toThrow(/already serves/)
    expect(fake.spawned).toEqual([])
  })

  it("reports a host that exits before it answers, with its output", async () => {
    const fake = fakeHost({ readyAfter: 1_000, exitOnStart: 1 })
    await expect(startGateHost(HOST, 5200, fake.runtime)).rejects.toThrow(
      /exited with 1[\s\S]*host log tail/,
    )
  })

  it("stops a host that never answers in time", async () => {
    const fake = fakeHost({ readyAfter: Number.POSITIVE_INFINITY })
    await expect(startGateHost(HOST, 5200, fake.runtime)).rejects.toThrow(/did not answer/)
    expect(fake.signals).toEqual(["SIGTERM"])
  })

  it("stops the host when warming fails", async () => {
    const fake = fakeHost({ failWarm: true })
    await expect(startGateHost(HOST, 5200, fake.runtime)).rejects.toThrow(/warming/)
    expect(fake.signals).toEqual(["SIGTERM"])
  })

  it("escalates to SIGKILL when the host ignores SIGTERM", async () => {
    const fake = fakeHost({ exitOnSignal: "SIGKILL" })
    const host = await startGateHost(HOST, 5200, fake.runtime)
    await host.stop()
    expect(fake.signals).toEqual(["SIGTERM", "SIGKILL"])
  })
})
