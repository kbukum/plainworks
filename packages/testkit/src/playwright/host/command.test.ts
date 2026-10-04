import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runOwnedCommand } from "./command"
import { HostShutdownError } from "./errors"

// Real POSIX process groups: each command leaves a grandchild in its group that records its pid,
// so these cases prove the whole group is released, not just the direct child.
const dirs: string[] = []
const pids: number[] = []

afterEach(() => {
  for (const pid of pids.splice(0)) if (alive(pid)) process.kill(pid, "SIGKILL")
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function command(options: { ignoreSigterm: boolean; afterStart: string; inheritStdio?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), "owned-command-"))
  dirs.push(dir)
  const file = join(dir, "grandchild")
  const body = `${options.ignoreSigterm ? 'process.on("SIGTERM", () => {});' : ""}
require("node:fs").writeFileSync(${JSON.stringify(file)}, String(process.pid))
setInterval(() => {}, 1000)`
  const script = `
const { spawn } = require("node:child_process")
spawn(process.execPath, ["-e", ${JSON.stringify(body)}], { stdio: ${JSON.stringify(options.inheritStdio === true ? "inherit" : "ignore")} })
const started = () => require("node:fs").existsSync(${JSON.stringify(file)})
const wait = setInterval(() => { if (started()) { clearInterval(wait); ${options.afterStart} } }, 10)
`
  return {
    args: ["-e", script],
    grandchild: (): number => {
      const pid = Number(readFileSync(file, "utf8"))
      pids.push(pid)
      return pid
    },
    started: () => existsSync(file),
  }
}

describe("runOwnedCommand", { timeout: 20_000 }, () => {
  it("returns the exit code and output, and releases what the command left behind", async () => {
    const owned = command({
      ignoreSigterm: false,
      afterStart: 'console.log("done"); process.exit(3)',
    })
    const result = await runOwnedCommand(process.execPath, owned.args, {
      signal: AbortSignal.timeout(10_000),
    })
    expect(result).toMatchObject({ code: 3, output: expect.stringContaining("done") })
    expect(alive(owned.grandchild())).toBe(false)
  })

  it("releases the group when cancelled and rejects with the cancellation", async () => {
    const owned = command({ ignoreSigterm: false, afterStart: "" })
    const controller = new AbortController()
    const run = runOwnedCommand(process.execPath, owned.args, { signal: controller.signal })
    while (!owned.started()) await new Promise((resolve) => setTimeout(resolve, 10))
    const reason = new Error("timed out")
    controller.abort(reason)
    await expect(run).rejects.toMatchObject({ name: "AbortError", cause: reason })
    expect(alive(owned.grandchild())).toBe(false)
  })

  it("reports forced termination of a group that ignores SIGTERM", async () => {
    const owned = command({ ignoreSigterm: true, afterStart: "process.exit(0)" })
    await expect(
      runOwnedCommand(process.execPath, owned.args, { signal: AbortSignal.timeout(10_000) }),
    ).rejects.toMatchObject(new HostShutdownError(true))
    expect(alive(owned.grandchild())).toBe(false)
  })

  it("returns when the command exits while a descendant still holds its output pipes", async () => {
    const owned = command({
      ignoreSigterm: false,
      inheritStdio: true,
      afterStart: 'console.log("done"); process.exit(4)',
    })
    const result = await runOwnedCommand(process.execPath, owned.args, {
      signal: AbortSignal.timeout(5_000),
    })
    expect(result).toMatchObject({ code: 4, output: expect.stringContaining("done") })
    expect(alive(owned.grandchild())).toBe(false)
  })

  it("does not start once already cancelled", async () => {
    const owned = command({ ignoreSigterm: false, afterStart: "" })
    await expect(
      runOwnedCommand(process.execPath, owned.args, { signal: AbortSignal.abort("stop") }),
    ).rejects.toMatchObject({ name: "AbortError", cause: "stop" })
    expect(owned.started()).toBe(false)
  })
})
