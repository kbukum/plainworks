import { isPositiveInteger } from "@plainworks/std"
import { assertTimerMs, combineSignals, raceAbort, withTimeout } from "@plainworks/std/resilience"
import type { BrowserGateHost, GateHostRuntime, RunningGateHost, SpawnedHost } from "./config"
import { HostShutdownError, HostStartupError } from "./errors"
import { nodeGateHostRuntime } from "./node-runtime"
import { gateHostOrigin, probeGateHost } from "./readiness"

const DEFAULT_START_TIMEOUT_MS = 30_000
const PROBE_TIMEOUT_MS = 1_000
const POLL_INTERVAL_MS = 250
const STOP_GRACE_MS = 10_000
const STOP_SETTLE_MS = 2_000

/** Start `host` on `port`, wait until it answers, warm its paths, and hand back its origin. */
export async function startGateHost(
  host: BrowserGateHost,
  port: number,
  runtime: GateHostRuntime = nodeGateHostRuntime,
  signal?: AbortSignal,
): Promise<RunningGateHost> {
  signal?.throwIfAborted()
  const origin = gateHostOrigin(host, port)
  const readyUrl = `${origin}${host.readyPath}`
  const startMs = host.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS
  const probeMs = host.probeTimeoutMs ?? PROBE_TIMEOUT_MS
  const stopMs = host.stopTimeoutMs ?? STOP_GRACE_MS
  for (const budget of [startMs, probeMs, stopMs]) {
    if (!isPositiveInteger(budget)) throw new Error("Host budgets must be positive milliseconds.")
    assertTimerMs(budget)
  }
  let child: SpawnedHost | undefined
  let stopAttempt: Promise<void> | undefined
  let stopFailure: HostShutdownError | undefined
  let transition: Promise<void> = Promise.resolve()
  const serialized = (action: () => Promise<void>): Promise<void> => {
    const result = transition.then(action)
    transition = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
  const stop = async (): Promise<void> => {
    if (child === undefined) {
      if (stopFailure !== undefined) throw stopFailure
      return
    }
    const owned = child
    stopAttempt ??= stopSpawnedHost(owned, runtime, stopMs)
    try {
      await stopAttempt
      child = undefined
    } catch (error) {
      if (error instanceof HostShutdownError && error.released) {
        child = undefined
        stopFailure = error
      }
      throw error
    } finally {
      stopAttempt = undefined
    }
  }
  const start = async (): Promise<void> => {
    signal?.throwIfAborted()
    if (!(await raceAbort(runtime.available(new URL(origin).hostname, port), signal))) {
      throw new Error(`Port ${port} already serves a listener. Each worker requires its own host.`)
    }
    signal?.throwIfAborted()
    const [command, ...args] =
      typeof host.command === "function" ? host.command({ port, origin }) : host.command
    const owned = runtime.spawn(command, args, {
      cwd: host.cwd,
      env: { PORT: String(port), ...host.env?.({ port, origin }) },
    })
    child = owned
    let exitCode: number | null | undefined
    const startup = new AbortController()
    const startupSignal = combineSignals(startup.signal, ...(signal === undefined ? [] : [signal]))
    void owned.exited.then((code) => {
      exitCode = code
      startup.abort(new Error(`Host exited with ${code} during startup.\n${owned.output()}`))
    })
    const deadline = runtime.clock.now() + startMs
    let diagnosis: unknown
    try {
      for (;;) {
        signal?.throwIfAborted()
        if (exitCode !== undefined) {
          throw new Error(`Host exited with ${exitCode} before readiness.\n${owned.output()}`)
        }
        const remaining = deadline - runtime.clock.now()
        if (remaining <= 0) {
          throw new Error(`Host did not answer readiness at ${readyUrl}.\n${owned.output()}`, {
            cause: diagnosis,
          })
        }
        try {
          await probeGateHost(host, origin, {
            runtime,
            timeoutMs: Math.min(probeMs, remaining),
            ...(signal === undefined ? {} : { signal }),
          })
          if (exitCode !== undefined) {
            throw new Error(`Host exited with ${exitCode} during readiness.\n${owned.output()}`)
          }
          break
        } catch (cause) {
          signal?.throwIfAborted()
          diagnosis = cause
        }
        await raceAbort(
          runtime.sleep(
            Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - runtime.clock.now())),
            signal,
          ),
          signal,
        )
      }
      for (const path of host.warmPaths ?? []) {
        startupSignal.throwIfAborted()
        await withTimeout(
          async (warmSignal) => {
            const response = await runtime.fetch(`${origin}${path}`, {
              redirect: "manual",
              signal: warmSignal,
            })
            await response.body?.cancel()
            warmSignal.throwIfAborted()
            // A reference host may intentionally redirect a protected document to login.
            if (response.status >= 400) throw new Error(`Warm path returned ${response.status}.`)
          },
          Math.max(1, deadline - runtime.clock.now()),
          { signal: startupSignal },
        ).catch((cause: unknown) => {
          throw new Error(`Host failed while warming ${origin}.\n${owned.output()}`, { cause })
        })
      }
      startupSignal.throwIfAborted()
    } catch (cause) {
      try {
        await stop()
      } catch (cleanup) {
        throw new HostStartupError(owner, child !== undefined, cause, cleanup)
      }
      throw cause
    } finally {
      startup.abort()
    }
  }
  const owner: RunningGateHost = {
    origin,
    stop: () => serialized(stop),
    restart: () =>
      serialized(async () => {
        await stop()
        await start()
      }),
  }
  await start()
  return owner
}

async function waitForExit(
  child: SpawnedHost,
  runtime: GateHostRuntime,
  budgetMs: number,
): Promise<boolean> {
  const timer = new AbortController()
  try {
    return await Promise.race([
      child.waitForRelease(timer.signal).then(() => true),
      runtime.sleep(budgetMs, timer.signal).then(() => false),
    ])
  } finally {
    timer.abort()
  }
}

/**
 * Release a spawned process group with a fresh budget of its own: SIGTERM, then SIGKILL after
 * `graceMs`. Forced termination rejects with {@link HostShutdownError}, never a graceful success.
 */
export async function stopSpawnedHost(
  child: SpawnedHost,
  runtime: GateHostRuntime,
  graceMs: number = STOP_GRACE_MS,
): Promise<void> {
  child.kill("SIGTERM")
  if (!(await waitForExit(child, runtime, graceMs))) {
    child.kill("SIGKILL")
    const settled = await waitForExit(child, runtime, STOP_SETTLE_MS)
    throw new HostShutdownError(settled)
  }
}
