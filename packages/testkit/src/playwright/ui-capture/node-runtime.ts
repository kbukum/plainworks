import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { raceAbort } from "@plainworks/std/resilience"
import { systemClock } from "@plainworks/std/time"
import { type Browser, chromium } from "@playwright/test"
import { nodeArtifactStore } from "../flow/report/artifacts"
import { nodeGateHostRuntime, probeGateHost, runOwnedCommand, startGateHost } from "../host"
import type { SheetRenderer } from "../review/sheets"
import { closeAfter, createBaseCapture } from "./base-capture"
import { runUiCapture, type UiCaptureRuntime } from "./command"
import { type UiCaptureConfig, uiCaptureHostPort } from "./config"
import { UiCaptureError } from "./errors"
import { nodeGitRunner } from "./git"
import { playwrightMcpConfig, playwrightMcpInitPage } from "./mcp"

const SHEET_VIEWPORT = { width: 1600, height: 900 }

/**
 * Run `ui:capture` for an app from its own script, such as `bun e2e/ui-capture.ts`, and resolve the
 * exit code to set. It runs in the app directory; artifacts land under `config.root`. SIGINT and
 * SIGTERM cancel the whole run, startup included, and both listeners are removed on every exit.
 */
export async function runUiCaptureCli(
  config: UiCaptureConfig,
  argv: readonly string[] = process.argv.slice(2),
): Promise<number> {
  const interrupt = new AbortController()
  const onSignal = (name: NodeJS.Signals): void => {
    interrupt.abort(new UiCaptureError("harness", `Interrupted by ${name}.`))
  }
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)
  try {
    const runtime = createNodeUiCaptureRuntime(config, interrupt.signal)
    return await closeAfter(
      () => runUiCapture(argv, config, runtime),
      () => runtime.close(),
      "ui:capture and closing its browser both failed.",
    )
  } finally {
    process.off("SIGINT", onSignal)
    process.off("SIGTERM", onSignal)
  }
}

/**
 * The real `ui:capture` runtime, plus `close`, which shuts the sheet renderer's browser. `signal`
 * cancels every phase; `serve` holds its host until it aborts.
 */
export function createNodeUiCaptureRuntime(
  config: UiCaptureConfig,
  signal: AbortSignal,
): UiCaptureRuntime & { close(): Promise<void> } {
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
  const runSuite: UiCaptureRuntime["runSuite"] = (invocation) =>
    runLogged(
      "bunx",
      [
        "playwright",
        "test",
        config.spec,
        ...(config.playwrightConfig === undefined ? [] : [`--config=${config.playwrightConfig}`]),
        "--reporter=line",
        ...(invocation.workers === undefined ? [] : [`--workers=${invocation.workers}`]),
      ],
      { env: invocation.env, log: invocation.log, signal: invocation.signal ?? signal },
    )

  return {
    store: nodeArtifactStore,
    git: nodeGitRunner,
    serving: async (url) => {
      const target = new URL(url)
      const port = Number(target.port || (target.protocol === "https:" ? 443 : 80))
      if (await nodeGateHostRuntime.available(target.hostname, port)) return false
      await probeGateHost(config.host, target.origin)
      return true
    },
    runSuite,
    captureBase: createBaseCapture(
      config,
      {
        repoRoot: async () => (await nodeGitRunner(["rev-parse", "--show-toplevel"])).trim(),
        createWorktreeDir: () => mkdtemp(join(tmpdir(), "plainworks-base-")),
        prepareRunDir: async (dir) => {
          await mkdir(dir, { recursive: true })
        },
        git: nodeGitRunner,
        removeDir: (path) => rm(path, { recursive: true, force: true }),
        runStep: runLogged,
        startHost: (cwd, capture) =>
          startGateHost({ ...config.host, cwd }, config.warmPort + 1, nodeGateHostRuntime, capture),
        runSuite,
        appendLog: (path, text) => writeFile(path, text, { flag: "a" }),
      },
      signal,
    ),
    serve: (mode) => serveWarmHost(config, mode, signal),
    renderSheet,
    clock: systemClock,
    print: printLine,
    signal,
    close: async () => {
      if (browser !== undefined) await (await browser).close()
    },
  }
}

/**
 * Own a capture host or a separate exploration host until interrupted. No credential state is
 * persisted or handed to exploration.
 */
async function serveWarmHost(
  config: UiCaptureConfig,
  mode: "capture" | "explore",
  signal: AbortSignal,
): Promise<void> {
  const port = uiCaptureHostPort(config, mode)
  const host = await startGateHost(config.host, port, nodeGateHostRuntime, signal)
  try {
    if (mode === "explore") {
      const dir = resolve(config.root, "mcp")
      const initPage = join(dir, "init-page.ts")
      await mkdir(dir, { recursive: true })
      await writeFile(initPage, playwrightMcpInitPage())
      const mcp = playwrightMcpConfig({
        origin: host.origin,
        initPage,
        outputDir: join(dir, "output"),
        executablePath: chromium.executablePath(),
      })
      const configPath = join(dir, "config.json")
      await writeFile(configPath, `${JSON.stringify(mcp, null, 2)}\n`)
      printLine(`Isolated exploration at ${host.origin}; sign in interactively. Stop with Ctrl-C.`)
      printLine(`Playwright MCP: bunx @playwright/mcp@0.0.82 --config ${configPath}`)
    } else {
      printLine(`Warm capture host at ${host.origin}. Reset precedes sign-in; stop with Ctrl-C.`)
    }
    // Serving until interrupted is the command's normal end, not a failure.
    await raceAbort(new Promise<never>(() => {}), signal).catch(() => undefined)
  } finally {
    await host.stop()
  }
}

const printLine = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

/** Run a command in its own released process group with its output appended to `log`. */
async function runLogged(
  command: string,
  args: readonly string[],
  options: {
    readonly env?: Readonly<Record<string, string>>
    readonly cwd?: string
    readonly log: string
    readonly signal: AbortSignal
  },
): Promise<number> {
  options.signal.throwIfAborted()
  await mkdir(dirname(options.log), { recursive: true })
  return (await runOwnedCommand(command, args, options)).code
}
