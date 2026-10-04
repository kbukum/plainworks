import type { WebAbortSignal } from "@plainworks/std/web"
import { describe, expect, it } from "vitest"
import type { BrowserGateHost, GateHostRuntime, SpawnedHost } from "./host"
import { HostStartupError, startGateHost } from "./host"

const HOST: BrowserGateHost = {
  command: ["bun", "run", "server.ts"],
  env: ({ origin }) => ({ APP_ORIGIN: origin }),
  basePort: 5200,
  readyPath: "/ready",
  readyStatus: 200,
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
  readyStatus?: number
  readyBody?: string
}): FakeHost {
  let clock = 0
  let probes = 0
  let started = false
  let resolveExit: (code: number | null) => void = () => {}
  let resolveRelease: () => void = () => {}
  const exited = new Promise<number | null>((resolve) => {
    resolveExit = resolve
  })
  const released = new Promise<void>((resolve) => {
    resolveRelease = resolve
  })
  const requests: string[] = []
  const signals: string[] = []
  const spawned: FakeHost["spawned"] = []
  const child: SpawnedHost = {
    exited,
    waitForRelease: () => released,
    output: () => "host log tail",
    kill: (signal) => {
      signals.push(signal)
      if (signal === (script.exitOnSignal ?? "SIGTERM")) {
        resolveExit(null)
        resolveRelease()
      }
    },
  }
  const runtime: GateHostRuntime = {
    available: async () => script.alreadyServing !== true,
    spawn: (command, args, options) => {
      started = true
      spawned.push({ command, args, env: { ...options.env } })
      if (script.exitOnStart !== undefined) {
        resolveExit(script.exitOnStart)
        resolveRelease()
      }
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
        return new Response(script.readyBody ?? "ok", { status: script.readyStatus ?? 200 })
      }
      if (script.failWarm === true) throw new TypeError("socket hang up")
      return new Response(null, { status: 302 })
    },
    sleep: async (ms) => {
      clock += ms
    },
    clock: { now: () => clock },
  }
  return {
    runtime,
    requests,
    signals,
    spawned,
    exit: (code) => {
      resolveExit(code)
      resolveRelease()
    },
  }
}

describe("startGateHost", () => {
  it("retains a retryable cleanup owner when failed startup cannot release its child", async () => {
    const fake = fakeHost({ readyAfter: 1000 })
    const spawn = fake.runtime.spawn
    const runtime: GateHostRuntime = {
      ...fake.runtime,
      spawn: (...args) => ({ ...spawn(...args), kill: () => {} }),
    }
    const error = await startGateHost({ ...HOST, stopTimeoutMs: 10 }, 5200, runtime).catch(
      (cause: unknown) => cause,
    )
    expect(error).toBeInstanceOf(HostStartupError)
    if (!(error instanceof HostStartupError)) throw error
    expect(error.retained).toBe(true)
    fake.exit(null)
    await error.host.stop()
  })

  it("reports forced startup cleanup as released, never as a retryable or graceful stop", async () => {
    const fake = fakeHost({ readyAfter: 1000, exitOnSignal: "SIGKILL" })
    const error = await startGateHost(HOST, 5200, fake.runtime).catch((cause: unknown) => cause)
    expect(error).toMatchObject({ kind: "testkit/host-startup", retained: false })
    if (!(error instanceof HostStartupError)) throw error
    expect(fake.signals).toEqual(["SIGTERM", "SIGKILL"])
    await expect(error.host.stop()).rejects.toThrow(/forced/i)
    expect(fake.signals).toEqual(["SIGTERM", "SIGKILL"])
  })

  it.each([0, -1, 1.5, 2_147_483_648])(
    "rejects invalid timer budget %s before spawning",
    async (budget) => {
      for (const option of ["startTimeoutMs", "probeTimeoutMs", "stopTimeoutMs"] as const) {
        const fake = fakeHost({})
        await expect(
          startGateHost({ ...HOST, [option]: budget }, 5200, fake.runtime),
        ).rejects.toThrow()
        expect(fake.spawned).toHaveLength(0)
      }
    },
  )

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

  it.each(["responding", "stalled"] as const)(
    "rejects startup and aborts %s warming when the child exits",
    async (mode) => {
      const fake = fakeHost({})
      let warmSignal: WebAbortSignal | undefined
      const runtime: GateHostRuntime = {
        ...fake.runtime,
        fetch: async (url, init) => {
          if (new URL(url).pathname === "/ready") return fake.runtime.fetch(url, init)
          warmSignal = init?.signal
          fake.exit(1)
          return mode === "responding" ? new Response(null, { status: 200 }) : new Promise(() => {})
        },
      }
      await expect(startGateHost(HOST, 5200, runtime)).rejects.toMatchObject({
        cause: { cause: { message: expect.stringMatching(/exited with 1/) } },
      })
      expect(warmSignal?.aborted).toBe(true)
      expect(fake.signals).toEqual(["SIGTERM"])
    },
  )

  it("escalates to SIGKILL when the host ignores SIGTERM", async () => {
    const fake = fakeHost({ exitOnSignal: "SIGKILL" })
    const host = await startGateHost(HOST, 5200, fake.runtime)
    await expect(host.stop()).rejects.toThrow(/forced/i)
    expect(fake.signals).toEqual(["SIGTERM", "SIGKILL"])
    await expect(host.stop()).rejects.toThrow(/forced/i)
    expect(fake.signals).toEqual(["SIGTERM", "SIGKILL"])
  })

  it.each([404, 302, 503])(
    "rejects readiness status %s and releases the process",
    async (status) => {
      const fake = fakeHost({ readyStatus: status })
      await expect(startGateHost(HOST, 5200, fake.runtime)).rejects.toThrow(/ready|answer/i)
      expect(fake.signals).toEqual(["SIGTERM"])
    },
  )

  it("rejects wrong readiness content even with the expected status", async () => {
    const fake = fakeHost({ readyBody: "unrelated listener" })
    await expect(
      startGateHost(
        { ...HOST, ready: async (response) => (await response.text()) === "ready" },
        5200,
        fake.runtime,
      ),
    ).rejects.toThrow(/ready|answer/i)
    expect(fake.signals).toEqual(["SIGTERM"])
  })

  it("uses the configured HTTPS origin in probes, warming, and the child environment", async () => {
    const fake = fakeHost({})
    const host = await startGateHost(
      { ...HOST, origin: (port) => `https://localhost:${port}` },
      5203,
      fake.runtime,
    )
    try {
      expect(host.origin).toBe("https://localhost:5203")
      expect(fake.spawned[0]?.env.APP_ORIGIN).toBe(host.origin)
      expect(fake.requests.every((url) => url.startsWith(host.origin))).toBe(true)
    } finally {
      await host.stop()
    }
  })

  it("cleans up after cancellation and preserves the cancellation failure", async () => {
    const fake = fakeHost({ readyAfter: Number.POSITIVE_INFINITY })
    const controller = new AbortController()
    controller.abort(new Error("test cancelled"))
    await expect(startGateHost(HOST, 5200, fake.runtime, controller.signal)).rejects.toThrow(
      /cancelled/,
    )
    expect(fake.spawned).toEqual([])
  })

  it("stops idempotently without signalling an already released process", async () => {
    const fake = fakeHost({})
    const host = await startGateHost(HOST, 5200, fake.runtime)
    await host.stop()
    await host.stop()
    expect(fake.signals).toEqual(["SIGTERM"])
  })

  it("builds direct argv from the same worker origin as its probes", async () => {
    const fake = fakeHost({})
    const host = await startGateHost(
      { ...HOST, command: ({ origin }) => ["auth-host", "-origin", origin] },
      5203,
      fake.runtime,
    )
    try {
      expect(fake.spawned[0]?.args).toEqual(["-origin", host.origin])
    } finally {
      await host.stop()
    }
  })
})
