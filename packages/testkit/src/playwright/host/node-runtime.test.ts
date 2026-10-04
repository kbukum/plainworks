import { createServer } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import type { BrowserGateHost, GateHostRuntime } from "./config"
import { HostShutdownError, HostStartupError } from "./errors"
import { startGateHost } from "./lifecycle"
import { nodeGateHostRuntime } from "./node-runtime"

// Real POSIX process groups: each host prints its own pid and keeps a grandchild in its group, so
// these cases prove the whole group, not just the direct child, is owned and released.
const GROUP = `
const { spawn } = require("node:child_process")
spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
console.log("pid=" + process.pid)
`

const NEVER_READY = `${GROUP}\nsetInterval(() => {}, 1000)`
const IGNORES_SIGTERM = `${GROUP}
process.on("SIGTERM", () => {})
require("node:http")
  .createServer((_request, response) => response.end("ok"))
  .listen(Number(process.env.PORT), "127.0.0.1")
`

const groups: number[] = []

afterEach(() => {
  for (const pid of groups.splice(0)) {
    if (groupAlive(pid)) process.kill(-pid, "SIGKILL")
  }
})

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        typeof address === "object" && address !== null ? resolve(address.port) : reject(),
      )
    })
  })
}

// Wraps the real runtime so a test can hold signals back (an unreleasable group) and read the pid.
function observedRuntime() {
  const state: { hold: boolean; output?: () => string } = { hold: false }
  const runtime: GateHostRuntime = {
    ...nodeGateHostRuntime,
    spawn: (command, args, options) => {
      const child = nodeGateHostRuntime.spawn(command, args, options)
      state.output = child.output
      return {
        ...child,
        kill: (signal) => {
          if (!state.hold) child.kill(signal)
        },
      }
    },
  }
  const pid = (): number => {
    const match = /pid=(\d+)/.exec(state.output?.() ?? "")
    if (match?.[1] === undefined) throw new Error("host did not report its pid")
    const value = Number(match[1])
    if (!groups.includes(value)) groups.push(value)
    return value
  }
  return { state, runtime, pid }
}

function host(script: string, overrides: Partial<BrowserGateHost> = {}): BrowserGateHost {
  return {
    command: [process.execPath, "-e", script],
    basePort: 0,
    origin: (port) => `http://127.0.0.1:${port}`,
    readyPath: "/ready",
    readyStatus: 200,
    startTimeoutMs: 500,
    stopTimeoutMs: 200,
    ...overrides,
  }
}

describe.skipIf(process.platform === "win32")("real process groups", () => {
  it("keeps a retryable owner when failed startup cannot release the group", async () => {
    const { state, runtime, pid: readPid } = observedRuntime()
    state.hold = true
    const error = await startGateHost(host(NEVER_READY), await freePort(), runtime).catch(
      (cause: unknown) => cause,
    )
    expect(error).toBeInstanceOf(HostStartupError)
    if (!(error instanceof HostStartupError)) throw error
    expect(error.retained).toBe(true)
    const pid = readPid()
    expect(groupAlive(pid)).toBe(true)

    state.hold = false
    await error.host.stop()
    expect(groupAlive(pid)).toBe(false)
  }, 10_000)

  it("force-kills a host that ignores SIGTERM and never reports it as graceful", async () => {
    const { runtime, pid: readPid } = observedRuntime()
    const running = await startGateHost(host(IGNORES_SIGTERM), await freePort(), runtime)
    const pid = readPid()
    const failure = await running.stop().catch((cause: unknown) => cause)
    expect(failure).toBeInstanceOf(HostShutdownError)
    expect(failure).toMatchObject({ released: true })
    expect(groupAlive(pid)).toBe(false)
    await expect(running.stop()).rejects.toBe(failure)
  }, 10_000)
})
