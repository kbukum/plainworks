import { createServer } from "node:net"
import { fileURLToPath } from "node:url"
import {
  type BrowserGateHost,
  HostShutdownError,
  startGateHost,
} from "@plainworks/testkit/playwright"
import { describe, expect, it } from "vitest"

const fixture = fileURLToPath(new URL("./http-host.fixture.mjs", import.meta.url))
const host: BrowserGateHost = {
  command: [process.execPath, fixture],
  basePort: 0,
  readyPath: "/ready",
  ready: async (response) => {
    const value: unknown = await response.json()
    return (
      typeof value === "object" &&
      value !== null &&
      "protocol" in value &&
      value.protocol === "plainworks.host.v1"
    )
  },
  startTimeoutMs: 5_000,
  probeTimeoutMs: 1_000,
  stopTimeoutMs: 1_000,
}
const readinessFailures: readonly Readonly<Record<string, string>>[] = [
  { HOST_READY_STATUS: "404" },
  { HOST_READY_STATUS: "302" },
  { HOST_PROTOCOL: "unrelated-host" },
  { HOST_HANG: "1" },
  { HOST_EARLY_EXIT: "1" },
]

async function state(origin: string): Promise<unknown> {
  return (await fetch(`${origin}/state`, { signal: AbortSignal.timeout(1_000) })).json()
}

async function ownPort(): Promise<number> {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject)
    listener.listen(0, "127.0.0.1", resolve)
  })
  const address = listener.address()
  if (address === null || typeof address === "string") throw new Error("Missing fixture port")
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => {
      if (error !== undefined) reject(error)
      else resolve()
    }),
  )
  return address.port
}

async function assertReleased(port: number): Promise<void> {
  const listener = createServer()
  try {
    await new Promise<void>((resolve, reject) => {
      listener.once("error", reject)
      listener.listen(port, "127.0.0.1", resolve)
    })
  } finally {
    if (listener.listening) {
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => {
          if (error !== undefined) reject(error)
          else resolve()
        }),
      )
    }
  }
}

describe("real owned host lifecycle", () => {
  it("restarts at the same origin without inheriting process-local state", async () => {
    const port = await ownPort()
    const running = await startGateHost(host, port)
    try {
      expect(await state(running.origin)).toEqual({ reads: 1 })
      await running.restart()
      expect(running.origin).toBe(`http://127.0.0.1:${port}`)
      expect(await state(running.origin)).toEqual({ reads: 1 })
    } finally {
      await running.stop()
    }
    await assertReleased(port)
  })

  it.each(readinessFailures)(
    "rejects failed readiness and releases its listener: %j",
    async (env) => {
      const port = await ownPort()
      await expect(
        startGateHost({ ...host, startTimeoutMs: 500, probeTimeoutMs: 100, env: () => env }, port),
      ).rejects.toThrow()
      await assertReleased(port)
    },
  )

  it("does not adopt or stop another listener, even one returning 404", async () => {
    const port = await ownPort()
    const listener = createServer((socket) => socket.end("HTTP/1.1 404 Not Found\r\n\r\n"))
    await new Promise<void>((resolve) => listener.listen(port, "127.0.0.1", resolve))
    try {
      await expect(startGateHost(host, port)).rejects.toThrow(/already serves/)
      expect(listener.listening).toBe(true)
    } finally {
      await new Promise<void>((resolve) => listener.close(() => resolve()))
    }
    await assertReleased(port)
  })

  it("releases a process after setup cancellation with a fresh stop budget", async () => {
    const port = await ownPort()
    const controller = new AbortController()
    const cancellation = new Error("cancel setup")
    const timer = setTimeout(() => controller.abort(cancellation), 100)
    try {
      await expect(
        startGateHost(
          { ...host, env: () => ({ HOST_HANG: "1" }) },
          port,
          undefined,
          controller.signal,
        ),
      ).rejects.toMatchObject({ kind: "std/aborted", cause: cancellation })
    } finally {
      clearTimeout(timer)
    }
    await assertReleased(port)
  })

  it("reports forced termination, remembers the failure, and leaves no listener", async () => {
    const port = await ownPort()
    const running = await startGateHost({ ...host, env: () => ({ HOST_IGNORE_TERM: "1" }) }, port)
    await expect(running.stop()).rejects.toBeInstanceOf(HostShutdownError)
    await expect(running.stop()).rejects.toMatchObject({ released: true })
    await assertReleased(port)
  })

  it("reports a missing executable without leaking setup ownership", async () => {
    const port = await ownPort()
    await expect(
      startGateHost({ ...host, command: ["/plainworks-fixture-missing-executable"] }, port),
    ).rejects.toThrow(/exited/)
    await assertReleased(port)
  })

  it("reaps an owned descendant that outlives the root and closes inherited output", async () => {
    const port = await ownPort()
    const descendantPort = await ownPort()
    const running = await startGateHost(
      {
        ...host,
        startTimeoutMs: 3_000,
        env: () => ({ HOST_DESCENDANT_PORT: String(descendantPort) }),
      },
      port,
    )
    const value = await state(running.origin)
    if (
      typeof value !== "object" ||
      value === null ||
      !("descendantPid" in value) ||
      typeof value.descendantPid !== "number"
    ) {
      throw new Error("Missing descendant identity")
    }
    let released = false
    try {
      await expect(running.stop()).rejects.toBeInstanceOf(HostShutdownError)
      await assertReleased(port)
      await assertReleased(descendantPort)
      released = true
    } finally {
      if (!released) process.kill(value.descendantPid, "SIGKILL")
    }
  })
})
