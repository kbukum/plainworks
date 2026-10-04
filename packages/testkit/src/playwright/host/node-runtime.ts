import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { createServer } from "node:net"
import type { Readable, Writable } from "node:stream"
import { raceAbort, systemDelay } from "@plainworks/std/resilience"
import { systemClock } from "@plainworks/std/time"
import type { GateHostRuntime } from "./config"

const OUTPUT_LIMIT = 65_536
const GROUP_SETTLE_POLL_MS = 25

const errorCode = (error: unknown): unknown =>
  error instanceof Error && "code" in error ? error.code : undefined

// macOS answers EPERM while a group's last member is a zombie awaiting its reaper, so EPERM means
// "not released yet"; the caller's bounded release budget still ends the wait.
function groupExists(pid: number | undefined): boolean {
  if (pid === undefined) return false
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (errorCode(error) === "ESRCH") return false
    if (errorCode(error) === "EPERM") return true
    throw error
  }
}

function portAvailable(hostname: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const listener = createServer()
    listener.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") resolve(false)
      else reject(error)
    })
    listener.listen(port, hostname, () => {
      listener.close((error) => {
        if (error !== undefined) reject(error)
        else resolve(true)
      })
    })
  })
}

/**
 * Record every chunk from `sources` and append it to `log`, pausing all sources while the log is
 * full so a slow log applies backpressure to the child instead of buffering without bound.
 */
export function pipeOutput(
  sources: readonly Readable[],
  log: Writable | undefined,
  record: (chunk: Buffer, source: Readable) => void,
): void {
  let waiting = false
  for (const source of sources) {
    source.on("data", (chunk: Buffer) => {
      record(chunk, source)
      if (log === undefined || log.write(chunk) || waiting) return
      waiting = true
      for (const each of sources) each.pause()
      log.once("drain", () => {
        waiting = false
        for (const each of sources) each.resume()
      })
    })
  }
}

/** POSIX process groups and explicitly configured Node TLS trust; no shell or TLS bypass. */
export const nodeGateHostRuntime: GateHostRuntime = {
  available: portAvailable,
  spawn: (command, args, options) => {
    if (process.platform === "win32") {
      throw new Error("Owned gate process groups require a POSIX host.")
    }
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    })
    const log =
      options.log === undefined ? undefined : createWriteStream(options.log, { flags: "a" })
    let stdout: Buffer = Buffer.alloc(0)
    let stderr: Buffer = Buffer.alloc(0)
    log?.on("error", (error) => {
      stderr = record(stderr, Buffer.from(`log ${options.log}: ${error.message}\n`))
    })
    const record = (previous: Buffer, chunk: Buffer): Buffer =>
      Buffer.concat([previous, chunk.subarray(-OUTPUT_LIMIT)]).subarray(-OUTPUT_LIMIT)
    pipeOutput([child.stdout, child.stderr], log, (chunk, source) => {
      if (source === child.stdout) stdout = record(stdout, chunk)
      else stderr = record(stderr, chunk)
    })
    // Pipes close only once every holder is gone, and a descendant may inherit them, so pipe
    // close never gates the direct child's exit; release (or an already-empty group) awaits it.
    const closed = new Promise<void>((resolve) => {
      child.once("close", () => {
        if (log === undefined) resolve()
        else log.end(() => resolve())
      })
    })
    const exited = new Promise<number | null>((resolve) => {
      child.once("exit", (code) => {
        if (groupExists(child.pid)) resolve(code)
        else void closed.then(() => resolve(code))
      })
      child.once("error", (error) => {
        const line = Buffer.from(`${error.message}\n`)
        stderr = record(stderr, line)
        log?.write(line)
        if (child.pid === undefined) void closed.then(() => resolve(null))
      })
    })
    let groupReleased = false
    const kill = (signal: "SIGTERM" | "SIGKILL"): void => {
      if (child.pid === undefined || groupReleased) return
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if (errorCode(error) !== "ESRCH" && errorCode(error) !== "EPERM") throw error
      }
    }
    // A runner can exit while a worker fixture is still starting, before its teardown is entered.
    // The normal owner still awaits bounded graceful shutdown; process exit has no async budget.
    const onExit = (): void => kill("SIGKILL")
    process.once("exit", onExit)
    return {
      exited,
      async waitForRelease(signal) {
        await raceAbort(exited, signal)
        while (groupExists(child.pid)) await systemDelay(GROUP_SETTLE_POLL_MS, signal)
        await raceAbort(closed, signal)
        groupReleased = true
        process.off("exit", onExit)
      },
      output: () => `${stdout.toString("utf8")}\n${stderr.toString("utf8")}`,
      kill,
    }
  },
  fetch: (url, { signal, ...init }) => {
    if (signal !== undefined && !(signal instanceof AbortSignal)) {
      throw new Error("The Node gate runtime requires a native AbortSignal.")
    }
    return fetch(url, { ...init, ...(signal === undefined ? {} : { signal }) })
  },
  sleep: (ms, signal) => systemDelay(ms, signal),
  clock: systemClock,
}
