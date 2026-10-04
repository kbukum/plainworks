import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { BrowserGateHost } from "../host"
import * as hostCommands from "../host"
import type { UiCaptureConfig } from "./config"
import { createNodeUiCaptureRuntime, runUiCaptureCli } from "./node-runtime"

// Real CLI runs against real process groups: each host writes its pid to a file and keeps a
// grandchild in its group, so cancellation must release the whole group.
const GROUP = `
const { spawn } = require("node:child_process")
spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
require("node:fs").writeFileSync(process.env.PID_FILE, String(process.pid))
`
const NEVER_READY = `${GROUP}\nsetInterval(() => {}, 1000)`
const READY = `${GROUP}
require("node:http")
  .createServer((_request, response) => response.end("ok"))
  .listen(Number(process.env.PORT), "127.0.0.1")
`

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
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

async function eventually<Value>(read: () => Promise<Value | undefined>): Promise<Value> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await read().catch(() => undefined)
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("condition never held")
}

function listeners(): number[] {
  return [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]
}

async function fixture(
  script: string,
): Promise<{ config: UiCaptureConfig; pid: () => Promise<number> }> {
  const dir = await mkdtemp(join(tmpdir(), "plainworks-capture-cli-"))
  const pidFile = join(dir, "host.pid")
  cleanups.push(async () => {
    const pid = Number(await readFile(pidFile, "utf8").catch(() => "0"))
    if (pid > 0 && groupAlive(pid)) process.kill(-pid, "SIGKILL")
    await rm(dir, { recursive: true, force: true })
  })
  const host: BrowserGateHost = {
    command: [process.execPath, "-e", script],
    env: () => ({ PID_FILE: pidFile }),
    basePort: 0,
    origin: (port) => `http://127.0.0.1:${port}`,
    readyPath: "/ready",
    readyStatus: 200,
    startTimeoutMs: 20_000,
    stopTimeoutMs: 2_000,
  }
  const config: UiCaptureConfig = {
    app: "@plainworks/fixture",
    appDir: ".",
    root: dir,
    spec: "flows.spec.ts",
    flows: [],
    host,
    warmPort: await freePort(),
  }
  return {
    config,
    pid: () => eventually(async () => Number(await readFile(pidFile, "utf8")) || undefined),
  }
}

describe.skipIf(process.platform === "win32")("ui:capture CLI ownership", () => {
  it("runs a flow with its selected Playwright configuration", async () => {
    const { config } = await fixture(NEVER_READY)
    const run = vi.spyOn(hostCommands, "runOwnedCommand").mockResolvedValue({ code: 0, output: "" })
    const runtime = createNodeUiCaptureRuntime(
      { ...config, playwrightConfig: "playwright.auth.config.ts" },
      new AbortController().signal,
    )
    try {
      await runtime.runSuite({ env: {}, log: join(config.root, "playwright.log") })
      expect(run).toHaveBeenCalledWith(
        "bunx",
        [
          "playwright",
          "test",
          "flows.spec.ts",
          "--config=playwright.auth.config.ts",
          "--reporter=line",
        ],
        expect.anything(),
      )
    } finally {
      run.mockRestore()
      await runtime.close()
    }
  })

  it("removes both signal listeners after a run that never starts a host", async () => {
    const before = listeners()
    const { config } = await fixture(NEVER_READY)
    await expect(runUiCaptureCli(config, ["--help"])).resolves.toBe(0)
    await expect(runUiCaptureCli(config, ["--unknown"])).resolves.not.toBe(0)
    expect(listeners()).toEqual(before)
  })

  it("SIGINT during host startup releases the whole group and fails the run", async () => {
    const before = listeners()
    const { config, pid } = await fixture(NEVER_READY)
    const run = runUiCaptureCli(config, ["serve"])
    const host = await pid()
    expect(groupAlive(host)).toBe(true)
    process.emit("SIGINT")
    await expect(run).resolves.toBe(2)
    expect(groupAlive(host)).toBe(false)
    expect(listeners()).toEqual(before)
  }, 15_000)

  it("SIGTERM ends a serving host as a normal stop and releases its group", async () => {
    const before = listeners()
    const { config, pid } = await fixture(READY)
    const write = vi.spyOn(process.stdout, "write")
    cleanups.push(async () => write.mockRestore())
    const run = runUiCaptureCli(config, ["serve"])
    const host = await pid()
    await eventually(async () =>
      write.mock.calls.some(([line]) => String(line).startsWith("Warm capture host"))
        ? true
        : undefined,
    )
    process.emit("SIGTERM")
    await expect(run).resolves.toBe(0)
    expect(groupAlive(host)).toBe(false)
    expect(listeners()).toEqual(before)
  }, 15_000)
})
