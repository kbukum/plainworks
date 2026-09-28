import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { type Browser, chromium } from "@playwright/test"
import { FLOW_RUN_ENV, nodeArtifactStore } from "../flow/report/artifacts"
import { browserGateUse, GATE_ORIGIN_ENV } from "../gate"
import { startGateHost } from "../host"
import type { SheetRenderer } from "../review/sheets"
import { runUiCheck, type UiCheckRuntime } from "./command"
import type { UiCheckConfig } from "./config"
import { UiCheckError } from "./errors"
import { nodeGitRunner } from "./git"
import { playwrightMcpConfig, playwrightMcpInitPage } from "./mcp"

const PROBE_TIMEOUT_MS = 2_000
// A base worktree installs and builds the app's dependencies from scratch unless turbo's cache
// already holds them.
const BASE_STEP_TIMEOUT_MS = 15 * 60_000
const SHEET_VIEWPORT = { width: 1600, height: 900 }

/**
 * Run `ui:check` for an app from its own script, such as `bun e2e/ui-check.ts`, and resolve the
 * exit code to set. It runs in the app directory; artifacts land under `config.root`.
 */
export async function runUiCheckCli(
  config: UiCheckConfig,
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const runtime = createNodeUiCheckRuntime(config)
  try {
    return await runUiCheck(argv, config, runtime)
  } finally {
    await runtime.close()
  }
}

/** The real `ui:check` runtime, plus `close`, which shuts the sheet renderer's browser. */
export function createNodeUiCheckRuntime(
  config: UiCheckConfig,
): UiCheckRuntime & { close(): Promise<void> } {
  let browser: Promise<Browser> | undefined
  const renderSheet: SheetRenderer = async (sheet) => {
    browser ??= chromium.launch()
    const page = await (await browser).newPage({ viewport: SHEET_VIEWPORT })
    try {
      await page.goto(pathToFileURL(resolve(sheet.html)).href, { waitUntil: "load" })
      await page.screenshot({ path: sheet.png, fullPage: true })
    } finally {
      await page.close()
    }
  }
  const runSuite: UiCheckRuntime["runSuite"] = (invocation) =>
    runLogged(
      "bunx",
      [
        "playwright",
        "test",
        config.spec,
        "--reporter=line",
        ...(invocation.workers === undefined ? [] : [`--workers=${invocation.workers}`]),
      ],
      { env: invocation.env, log: invocation.log, signal: invocation.signal },
    )

  return {
    store: nodeArtifactStore,
    git: nodeGitRunner,
    serving: async (url) => {
      try {
        const response = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        await response.body?.cancel()
        return response.status < 500
      } catch {
        // Nothing listens there.
        return false
      }
    },
    runSuite,
    captureBase: async ({ commit, run, env, signal }) => {
      const log = join(run.dir, "capture.log")
      await mkdir(run.dir, { recursive: true })
      const repo = (await nodeGitRunner(["rev-parse", "--show-toplevel"])).trim()
      const worktree = await mkdtemp(join(tmpdir(), "plainworks-base-"))
      const step = async (what: string, command: string, args: readonly string[], cwd: string) => {
        const code = await runLogged(command, args, {
          cwd,
          log,
          signal: withStepTimeout(signal),
        })
        if (code !== 0) {
          throw new UiCheckError("base", `${what} failed at ${commit.slice(0, 12)}; see ${log}`)
        }
      }
      try {
        await nodeGitRunner(["worktree", "add", "--detach", worktree, commit])
        await step("bun install", "bun", ["install", "--frozen-lockfile"], worktree)
        await step(
          "Building the app's dependencies",
          "bunx",
          [
            "turbo",
            "run",
            "build",
            `--filter=${config.app}^...`,
            `--cache-dir=${join(repo, ".turbo", "cache")}`,
          ],
          worktree,
        )
        const host = await startGateHost(
          { ...config.host, cwd: join(worktree, config.appDir) },
          config.warmPort + 1,
        ).catch((cause: unknown) => {
          throw new UiCheckError("base", `The host at ${commit.slice(0, 12)} did not start`, {
            cause,
          })
        })
        try {
          const code = await runSuite({
            env: { ...env, [FLOW_RUN_ENV]: run.dir, [GATE_ORIGIN_ENV]: host.origin },
            workers: 1,
            log: join(run.dir, "playwright.log"),
            ...(signal === undefined ? {} : { signal }),
          })
          // A failing flow at the base still captured its frames; only a crash leaves none.
          if (code !== 0) await writeFile(log, `Playwright exited with ${code}\n`, { flag: "a" })
        } finally {
          await host.stop()
        }
      } finally {
        await nodeGitRunner(["worktree", "remove", "--force", worktree]).catch(() => undefined)
        await rm(worktree, { recursive: true, force: true })
      }
    },
    serve: () => serveWarmHost(config),
    renderSheet,
    now: () => Date.now(),
    print: printLine,
    close: async () => {
      if (browser !== undefined) await (await browser).close()
    },
  }
}

/**
 * Start the app's host on its warm port, save a signed-in state, and write the Playwright MCP
 * config beside it. Resolves once the process is interrupted and the host stopped.
 */
async function serveWarmHost(config: UiCheckConfig): Promise<void> {
  const host = await startGateHost(config.host, config.warmPort)
  try {
    const dir = resolve(config.root, "mcp")
    const storageState = join(dir, "storage-state.json")
    const initPage = join(dir, "init-page.ts")
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ ...browserGateUse, baseURL: host.origin })
      if (config.signIn !== undefined) await config.signIn(await context.newPage())
      await mkdir(dir, { recursive: true })
      await context.storageState({ path: storageState })
    } finally {
      await browser.close()
    }
    await writeFile(initPage, playwrightMcpInitPage())
    const mcp = playwrightMcpConfig({
      origin: host.origin,
      storageState,
      initPage,
      outputDir: join(dir, "output"),
      executablePath: chromium.executablePath(),
    })
    const configPath = join(dir, "config.json")
    await writeFile(configPath, `${JSON.stringify(mcp, null, 2)}\n`)
    printLine(`Warm host at ${host.origin}. ui:check reuses it until you stop this (Ctrl-C).`)
    printLine(`Playwright MCP: bunx @playwright/mcp@0.0.82 --config ${configPath}`)
    await new Promise<void>((settle) => {
      process.once("SIGINT", () => settle())
      process.once("SIGTERM", () => settle())
    })
  } finally {
    await host.stop()
  }
}

const printLine = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

/** Run a command with its output appended to `log`, and resolve its exit code. */
function runLogged(
  command: string,
  args: readonly string[],
  options: {
    readonly env?: Readonly<Record<string, string>>
    readonly cwd?: string
    readonly log: string
    readonly signal?: AbortSignal | undefined
  },
): Promise<number> {
  return new Promise((settle, reject) => {
    void mkdir(dirname(options.log), { recursive: true }).then(() => {
      const out = createWriteStream(options.log, { flags: "a" })
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      child.stdout.pipe(out, { end: false })
      child.stderr.pipe(out, { end: false })
      child.once("error", (error) => {
        out.end()
        reject(new UiCheckError("harness", `Could not run ${command}: ${error.message}`))
      })
      child.once("close", (code) => {
        out.end()
        settle(code ?? 1)
      })
    }, reject)
  })
}

// A caller's cancellation never lifts the per-step ceiling on an install or build.
const withStepTimeout = (signal: AbortSignal | undefined): AbortSignal => {
  const timeout = AbortSignal.timeout(BASE_STEP_TIMEOUT_MS)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}
