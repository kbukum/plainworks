import { spawn } from "node:child_process"
import { type Clock, systemClock } from "@plainworks/std/time"

/**
 * How to start one reference host for one Playwright worker. Each worker gets its own process on
 * its own port, so tests that reset the host's backend never race another worker.
 */
export interface BrowserGateHost {
  /** The command and its arguments, run without a shell. */
  readonly command: readonly [string, ...string[]]
  /** Extra environment for the host, built from the worker's port and origin. */
  readonly env?: (target: {
    readonly port: number
    readonly origin: string
  }) => Readonly<Record<string, string>>
  /** The working directory. Defaults to the runner's. */
  readonly cwd?: string
  /** Worker `n` listens on `basePort + n`. */
  readonly basePort: number
  /** A path that answers once the host serves requests. */
  readonly readyPath: string
  /** Paths requested once after start, so the first test does not pay for a cold compile. */
  readonly warmPaths?: readonly string[]
  /** How long the host may take to answer `readyPath`. Defaults to 180 s. */
  readonly startTimeoutMs?: number
}

/** A started host process, as {@link startGateHost} drives it. */
export interface SpawnedHost {
  /** Settles with the exit code (or `null` for a signal) once the process ends. */
  readonly exited: Promise<number | null>
  /** The last lines the process wrote, for a failure message. */
  output(): string
  /** Send `signal` to the process and everything it started. */
  kill(signal: "SIGTERM" | "SIGKILL"): void
}

/** The seams {@link startGateHost} runs through, injectable so its logic is testable. */
export interface GateHostRuntime {
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string | undefined; readonly env: Readonly<Record<string, string>> },
  ) => SpawnedHost
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>
  readonly sleep: (ms: number) => Promise<void>
  readonly clock: Clock
}

/** A host serving one worker. */
export interface RunningGateHost {
  readonly origin: string
  /** Stop the host and wait for it to exit. */
  stop(): Promise<void>
}

const DEFAULT_START_TIMEOUT_MS = 180_000
const PROBE_TIMEOUT_MS = 2_000
const WARM_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 250
const STOP_GRACE_MS = 10_000
const OUTPUT_LIMIT = 8_192

/** Start `host` on `port`, wait until it answers, warm its paths, and hand back its origin. */
export async function startGateHost(
  host: BrowserGateHost,
  port: number,
  runtime: GateHostRuntime = nodeGateHostRuntime,
): Promise<RunningGateHost> {
  const origin = `http://127.0.0.1:${port}`
  const readyUrl = `${origin}${host.readyPath}`
  if (await answers(runtime, readyUrl)) {
    throw new Error(
      `Port ${port} already serves ${readyUrl}. Stop that server: each worker starts its own host.`,
    )
  }

  const [command, ...args] = host.command
  const child = runtime.spawn(command, args, {
    cwd: host.cwd,
    env: { PORT: String(port), ...host.env?.({ port, origin }) },
  })
  let exitCode: number | null | undefined
  void child.exited.then((code) => {
    exitCode = code
  })
  const running: RunningGateHost = { origin, stop: () => stopHost(child, runtime) }

  const deadline = runtime.clock.now() + (host.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS)
  for (;;) {
    if (exitCode !== undefined) {
      throw new Error(
        `Host exited with ${exitCode} before it answered ${readyUrl}.\n${child.output()}`,
      )
    }
    if (await answers(runtime, readyUrl)) break
    if (runtime.clock.now() >= deadline) {
      await running.stop()
      throw new Error(`Host did not answer ${readyUrl} in time.\n${child.output()}`)
    }
    await runtime.sleep(POLL_INTERVAL_MS)
  }

  try {
    for (const path of host.warmPaths ?? []) {
      const response = await runtime.fetch(`${origin}${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
      })
      await response.body?.cancel()
    }
  } catch (cause) {
    await running.stop()
    throw new Error(`Host failed while warming ${origin}.\n${child.output()}`, { cause })
  }
  return running
}

async function answers(runtime: GateHostRuntime, url: string): Promise<boolean> {
  try {
    const response = await runtime.fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    await response.body?.cancel()
    return response.status < 500
  } catch {
    // Nothing listens yet, or the host is still compiling past the probe timeout.
    return false
  }
}

async function stopHost(child: SpawnedHost, runtime: GateHostRuntime): Promise<void> {
  child.kill("SIGTERM")
  const exited = await Promise.race([
    child.exited.then(() => true),
    runtime.sleep(STOP_GRACE_MS).then(() => false),
  ])
  if (!exited) {
    child.kill("SIGKILL")
    await child.exited
  }
}

/** The real runtime: a detached process group, so a stop reaches every process the host starts. */
export const nodeGateHostRuntime: GateHostRuntime = {
  spawn: (command, args, options) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    })
    let output = ""
    const record = (chunk: Buffer): void => {
      output = (output + chunk.toString("utf8")).slice(-OUTPUT_LIMIT)
    }
    child.stdout.on("data", record)
    child.stderr.on("data", record)
    const exited = new Promise<number | null>((resolve) => {
      child.once("exit", (code) => resolve(code))
      child.once("error", (error) => {
        record(Buffer.from(`${error.message}\n`))
        resolve(null)
      })
    })
    return {
      exited,
      output: () => output,
      kill: (signal) => {
        if (child.pid === undefined || child.exitCode !== null) return
        try {
          process.kill(-child.pid, signal)
        } catch {
          // The group already exited between the check and the signal.
        }
      },
    }
  },
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clock: systemClock,
}
