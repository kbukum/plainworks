import { join } from "node:path"
import { FLOW_RUN_ENV } from "../flow/report/artifacts"
import { GATE_ORIGIN_ENV } from "../gate"
import type { RunningGateHost } from "../host"
import type { UiCaptureRuntime } from "./command"
import type { UiCaptureConfig } from "./config"
import { UiCaptureError } from "./errors"

// A base worktree installs and builds the app's dependencies from scratch unless turbo's cache
// already holds them.
const BASE_STEP_TIMEOUT_MS = 15 * 60_000

/** The effects a base capture runs through. `node-runtime` wires them to Node, git and Playwright. */
export interface BaseCaptureSystem {
  /** The repository's top-level directory. */
  readonly repoRoot: () => Promise<string>
  /** A fresh, empty directory for the base worktree. */
  readonly createWorktreeDir: () => Promise<string>
  /** Create the run directory that holds the capture's logs. */
  readonly prepareRunDir: (dir: string) => Promise<void>
  readonly git: (args: readonly string[]) => Promise<string>
  readonly removeDir: (path: string) => Promise<void>
  /** Run one build step with its output appended to `log`, and resolve its exit code. */
  readonly runStep: (
    command: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly log: string; readonly signal: AbortSignal },
  ) => Promise<number>
  /** Start the app's host from the base worktree's app directory. */
  readonly startHost: (cwd: string, signal: AbortSignal) => Promise<RunningGateHost>
  readonly runSuite: UiCaptureRuntime["runSuite"]
  readonly appendLog: (path: string, text: string) => Promise<void>
}

/**
 * Capture the flows against a base commit: check it out in a detached worktree, install and build
 * the app's dependencies, start its host, and run the suite with one worker. Every failure is a
 * `base` {@link UiCaptureError} or keeps its cause. The worktree is removed on every exit, and a
 * cleanup failure joins the failure that started it instead of replacing it.
 */
export function createBaseCapture(
  config: Pick<UiCaptureConfig, "app" | "appDir">,
  system: BaseCaptureSystem,
  signal: AbortSignal,
): UiCaptureRuntime["captureBase"] {
  return async ({ commit, run, env, signal: capture = signal }) => {
    capture.throwIfAborted()
    const short = commit.slice(0, 12)
    const log = join(run.dir, "capture.log")
    await system.prepareRunDir(run.dir)
    const repo = await system.repoRoot()
    const worktree = await system.createWorktreeDir()
    const step = async (what: string, command: string, args: readonly string[]) => {
      const code = await system.runStep(command, args, {
        cwd: worktree,
        log,
        signal: withStepTimeout(capture),
      })
      if (code !== 0) throw new UiCaptureError("base", `${what} failed at ${short}; see ${log}`)
    }
    const errors: unknown[] = []
    try {
      capture.throwIfAborted()
      await system.git(["worktree", "add", "--detach", worktree, commit])
      await step("bun install", "bun", ["install", "--frozen-lockfile"])
      await step("Building the app's dependencies", "bunx", [
        "turbo",
        "run",
        "build",
        `--filter=${config.app}^...`,
        `--cache-dir=${join(repo, ".turbo", "cache")}`,
      ])
      const host = await system
        .startHost(join(worktree, config.appDir), capture)
        .catch((cause: unknown) => {
          throw new UiCaptureError("base", `The host at ${short} did not start`, { cause })
        })
      const code = await closeAfter(
        () =>
          system.runSuite({
            env: { ...env, [FLOW_RUN_ENV]: run.dir, [GATE_ORIGIN_ENV]: host.origin },
            workers: 1,
            log: join(run.dir, "playwright.log"),
            signal: capture,
          }),
        () => host.stop(),
        "Base capture and host stop failed.",
      )
      // A failing flow at the base still captured its frames; only a crash leaves none.
      if (code !== 0) await system.appendLog(log, `Playwright exited with ${code}\n`)
    } catch (cause) {
      errors.push(cause)
    }
    const failed = errors.length
    await system.git(["worktree", "remove", "--force", worktree]).catch((cause: unknown) => {
      errors.push(cause)
    })
    await system.removeDir(worktree).catch((cause: unknown) => {
      errors.push(cause)
    })
    if (errors.length > failed) {
      throw new UiCaptureError("base", `Could not remove the base worktree ${worktree}.`, {
        cause: new AggregateError(errors),
      })
    }
    if (failed > 0) throw errors[0]
  }
}

/**
 * Run `body`, then `close` on every exit, and keep both failures: a close failure joins the body's
 * failure in an `AggregateError` instead of replacing it.
 */
export async function closeAfter<Value>(
  body: () => Promise<Value>,
  close: () => Promise<void>,
  message = "The run and its cleanup both failed.",
): Promise<Value> {
  let value: Value
  try {
    value = await body()
  } catch (failure) {
    await close().catch((cause: unknown) => {
      throw new AggregateError([failure, cause], message)
    })
    throw failure
  }
  await close()
  return value
}

// A caller's cancellation never lifts the per-step ceiling on an install or build.
const withStepTimeout = (signal: AbortSignal): AbortSignal =>
  AbortSignal.any([signal, AbortSignal.timeout(BASE_STEP_TIMEOUT_MS)])
